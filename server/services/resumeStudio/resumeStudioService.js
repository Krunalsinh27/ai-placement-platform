const crypto = require('crypto');
const mongoose = require('mongoose');
const { Resume, ResumeVersion, Student, Application, User, ResumeReview } = require('../../models');

const DEFAULT_MAX_UNSUBMITTED_VERSIONS = 20;

/**
 * Resolves the student document and verifies college multi-tenancy.
 */
async function getStudentProfile(user) {
  const userId = user._id || user.id;
  let student = await Student.findOne({ user: userId });
  if (!student && mongoose.Types.ObjectId.isValid(userId)) {
    student = await Student.findById(userId);
  }

  if (!student) {
    const err = new Error('Student profile not found');
    err.statusCode = 404;
    throw err;
  }

  const userCollegeId = String(user.college?._id || user.college || '');
  if (userCollegeId && String(student.college) !== userCollegeId) {
    const err = new Error('Access denied: college mismatch');
    err.statusCode = 403;
    throw err;
  }

  return student;
}

/**
 * Fetches a Resume and verifies both student ownership and college multi-tenancy.
 */
async function getResumeWithOwnershipCheck(resumeId, student) {
  if (!mongoose.Types.ObjectId.isValid(resumeId)) {
    const err = new Error('Invalid resume ID');
    err.statusCode = 400;
    throw err;
  }

  const resume = await Resume.findById(resumeId);
  if (!resume) {
    const err = new Error('Resume not found');
    err.statusCode = 404;
    throw err;
  }

  if (String(resume.student) !== String(student._id)) {
    const err = new Error('Access denied: you do not own this resume');
    err.statusCode = 403;
    throw err;
  }

  if (String(resume.college) !== String(student.college)) {
    const err = new Error('Access denied: college mismatch');
    err.statusCode = 403;
    throw err;
  }

  return resume;
}

/**
 * Checks whether a specific ResumeVersion is submitted directly or referenced by an Application.
 */
async function isVersionSubmittedOrReferenced(versionId) {
  const version = await ResumeVersion.findById(versionId).select('submitted');
  if (!version) return false;
  if (version.submitted) return true;

  const hasApp = await Application.exists({ resumeVersion: versionId });
  return Boolean(hasApp);
}

/**
 * GET /resumes
 * Lists a student's resumes with pagination and active/archived filter.
 */
async function listResumes(student, options = {}) {
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(options.limit, 10) || 10));
  const isArchived = Boolean(options.archived);
  const skip = (page - 1) * limit;

  const query = {
    student: student._id,
    college: student.college,
    archived: isArchived,
    deleted: { $ne: true },
  };

  const total = await Resume.countDocuments(query);
  const resumes = await Resume.find(query)
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return {
    resumes,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * POST /resumes
 * Creates a new Resume. If isPrimary is true, any existing primary resume is unset.
 * If student has zero active resumes, defaults isPrimary to true.
 */
async function createResume(student, data = {}) {
  const activeCount = await Resume.countDocuments({
    student: student._id,
    archived: false,
    deleted: { $ne: true },
  });

  const wantsPrimary = Boolean(data.isPrimary) || activeCount === 0;

  if (wantsPrimary) {
    await Resume.updateMany(
      { student: student._id, isPrimary: true },
      { $set: { isPrimary: false } }
    );
  }

  const resume = await Resume.create({
    student: student._id,
    college: student.college,
    title: data.title || 'Untitled Resume',
    templateId: data.templateId || 'modern',
    data: data.data || {},
    isPrimary: wantsPrimary,
    archived: false,
    deleted: false,
    deletedAt: null,
    draftUpdatedAt: new Date(),
  });

  return resume;
}

/**
 * GET /resumes/:id
 * Fetches a single resume for the student. If the resume is in Trash (soft-deleted),
 * returns HTTP 410 Gone with clear metadata so the client can present the restore view.
 */
async function getResume(resumeId, student) {
  const resume = await getResumeWithOwnershipCheck(resumeId, student);
  if (resume.deleted) {
    const err = new Error('This resume has been moved to Trash');
    err.statusCode = 410;
    err.isDeleted = true;
    err.resume = {
      _id: resume._id,
      title: resume.title,
      templateId: resume.templateId,
      deleted: true,
      deletedAt: resume.deletedAt,
      archived: resume.archived,
    };
    throw err;
  }
  return resume;
}

/**
 * PATCH /resumes/:id
 * Updates editable fields of a resume (title, templateId, data, isPrimary).
 */
async function updateResume(resumeId, student, updates = {}) {
  const resume = await getResumeWithOwnershipCheck(resumeId, student);

  if (updates.isPrimary === true && !resume.isPrimary) {
    if (resume.archived) {
      const err = new Error('Cannot set an archived resume as primary');
      err.statusCode = 400;
      throw err;
    }
    if (resume.deleted) {
      const err = new Error('Cannot set a deleted resume as primary');
      err.statusCode = 400;
      throw err;
    }
    await Resume.updateMany(
      { student: student._id, isPrimary: true },
      { $set: { isPrimary: false } }
    );
    resume.isPrimary = true;
  } else if (updates.isPrimary === false && resume.isPrimary) {
    resume.isPrimary = false;
  }

  if (updates.title !== undefined) {
    resume.title = updates.title;
  }
  if (updates.templateId !== undefined) {
    resume.templateId = updates.templateId;
  }
  if (updates.data !== undefined) {
    resume.data = updates.data;
    resume.draftUpdatedAt = new Date();
  }
  if (updates.archived !== undefined) {
    resume.archived = Boolean(updates.archived);
  }
  if (updates.deleted !== undefined) {
    resume.deleted = Boolean(updates.deleted);
    resume.deletedAt = resume.deleted ? new Date() : null;
    if (resume.deleted) {
      resume.isPrimary = false;
    }
  }

  await resume.save();
  return resume;
}

/**
 * Safely executes database operations within a MongoDB transaction if supported by the deployment
 * (e.g. MongoDB Atlas replica set), with automatic fallback to sequential execution if transactions
 * are unsupported (e.g. standalone single-node test daemon).
 */
async function executeWithTransactionOrFallback(callback) {
  let session = null;
  try {
    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      result = await callback(session);
    });
    return result;
  } catch (err) {
    const isTxnUnsupported =
      err.message?.includes('Transaction numbers are only allowed on a replica set member or mongos') ||
      err.message?.includes('This MongoDB deployment does not support retryable writes') ||
      err.message?.includes('Standalone servers do not support transactions') ||
      err.code === 20 ||
      err.codeName === 'IllegalOperation';

    if (isTxnUnsupported) {
      return await callback(null);
    }
    throw err;
  } finally {
    if (session) {
      await session.endSession().catch(() => {});
    }
  }
}

/**
 * DELETE /resumes/:id
 * Archives the resume and unsets primary status (preserved for backwards compatibility).
 * If the primary resume is archived, automatically promotes another eligible active resume.
 */
async function archiveResume(resumeId, student) {
  return await executeWithTransactionOrFallback(async (session) => {
    const sessionOpts = session ? { session } : {};
    const resume = await getResumeWithOwnershipCheck(resumeId, student);

    if (resume.deleted) {
      const err = new Error('Cannot archive a resume that is in Trash.');
      err.statusCode = 400;
      throw err;
    }

    const wasPrimary = Boolean(resume.isPrimary);
    resume.archived = true;
    resume.isPrimary = false;
    await resume.save(sessionOpts);

    if (wasPrimary) {
      await Resume.findOneAndUpdate(
        {
          student: student._id,
          college: student.college,
          archived: false,
          deleted: { $ne: true },
          _id: { $ne: resume._id },
        },
        { $set: { isPrimary: true } },
        { sort: { updatedAt: -1 }, new: true, ...sessionOpts }
      );
    }

    return resume;
  });
}

/**
 * POST /resumes/:id/unarchive
 * Unarchives an archived resume, returning it to active state.
 */
async function unarchiveResume(resumeId, student) {
  const resume = await getResumeWithOwnershipCheck(resumeId, student);

  if (resume.deleted) {
    const err = new Error('Cannot unarchive a resume that is in Trash. Restore it first.');
    err.statusCode = 400;
    throw err;
  }

  resume.archived = false;
  await resume.save();

  return resume;
}

/**
 * POST /resumes/:id/trash
 * Soft deletes (moves to Trash) the resume and unsets primary status.
 * Transactionally atomic on replica set / Atlas deployments.
 * If the primary resume is deleted:
 * - Automatically selects another eligible active resume as primary if one exists.
 * - If no active resume remains, leaves primary as null without invalid references.
 */
async function trashResume(resumeId, student) {
  return await executeWithTransactionOrFallback(async (session) => {
    const sessionOpts = session ? { session } : {};
    const resume = await getResumeWithOwnershipCheck(resumeId, student);

    const wasPrimary = Boolean(resume.isPrimary);
    resume.deleted = true;
    resume.deletedAt = new Date();
    resume.isPrimary = false;
    await resume.save(sessionOpts);

    let nextPrimary = null;
    if (wasPrimary) {
      nextPrimary = await Resume.findOneAndUpdate(
        {
          student: student._id,
          college: student.college,
          archived: false,
          deleted: { $ne: true },
          _id: { $ne: resume._id },
        },
        { $set: { isPrimary: true } },
        { sort: { updatedAt: -1 }, new: true, ...sessionOpts }
      );
    }

    return resume;
  });
}

/**
 * GET /resumes/trash
 * Lists student's soft-deleted resumes (Trash tab) with pagination.
 */
async function listTrashResumes(student, options = {}) {
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(options.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const query = {
    student: student._id,
    college: student.college,
    deleted: true,
  };

  const total = await Resume.countDocuments(query);
  const resumes = await Resume.find(query)
    .sort({ deletedAt: -1, updatedAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return {
    resumes,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * POST /resumes/:id/restore-trash
 * Restores a resume from Trash back to its prior active or archived state.
 */
async function restoreTrashResume(resumeId, student) {
  const resume = await getResumeWithOwnershipCheck(resumeId, student);

  if (!resume.deleted) {
    const err = new Error('Resume is not in Trash');
    err.statusCode = 400;
    throw err;
  }

  resume.deleted = false;
  resume.deletedAt = null;
  await resume.save();

  return resume;
}

/**
 * POST /resumes/:id/duplicate
 * Duplicates a resume with its content and template; duplicates are never primary.
 */
async function duplicateResume(resumeId, student, options = {}) {
  const original = await getResumeWithOwnershipCheck(resumeId, student);

  const duplicate = await Resume.create({
    student: student._id,
    college: student.college,
    title: options.title || `${original.title} (Copy)`,
    templateId: original.templateId,
    data: JSON.parse(JSON.stringify(original.data || {})),
    isPrimary: false,
    archived: false,
    deleted: false,
    deletedAt: null,
    draftUpdatedAt: new Date(),
  });

  return duplicate;
}

/**
 * POST /resumes/:id/primary
 * Sets a specific non-archived, non-deleted resume as the student's primary resume.
 */
async function setPrimaryResume(resumeId, student) {
  const resume = await getResumeWithOwnershipCheck(resumeId, student);

  if (resume.archived) {
    const err = new Error('Cannot set an archived resume as primary');
    err.statusCode = 400;
    throw err;
  }
  if (resume.deleted) {
    const err = new Error('Cannot set a deleted resume as primary');
    err.statusCode = 400;
    throw err;
  }

  await Resume.updateMany(
    { student: student._id, isPrimary: true },
    { $set: { isPrimary: false } }
  );

  resume.isPrimary = true;
  await resume.save();

  return resume;
}

/**
 * GET /resumes/:id/versions
 * Lists versions belonging to a resume with submission indicators and pagination.
 */
async function listResumeVersions(resumeId, student, options = {}) {
  const resume = await getResumeWithOwnershipCheck(resumeId, student);

  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(options.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const query = {
    resume: resume._id,
    student: student._id,
  };

  const total = await ResumeVersion.countDocuments(query);
  const versions = await ResumeVersion.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // Annotate submission status (submitted flag or Application reference)
  const versionIds = versions.map((v) => v._id);
  const applicationReferences = await Application.find({
    resumeVersion: { $in: versionIds },
  })
    .select('resumeVersion')
    .lean();

  const referencedSet = new Set(
    applicationReferences.map((app) => String(app.resumeVersion))
  );

  const annotatedVersions = versions.map((v) => ({
    ...v,
    isSubmitted: Boolean(v.submitted || referencedSet.has(String(v._id))),
  }));

  return {
    versions: annotatedVersions,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * POST /resumes/:id/versions
 * Creates a new version under the resume.
 * Prunes only the oldest UNSUBMITTED version when the unsubmitted version limit is exceeded.
 * Never touches submitted versions or versions referenced by applications.
 */
async function createResumeVersion(resumeId, student, versionInput = {}) {
  const resume = await getResumeWithOwnershipCheck(resumeId, student);

  const maxUnsubmitted =
    parseInt(process.env.RESUME_STUDIO_MAX_VERSIONS, 10) || DEFAULT_MAX_UNSUBMITTED_VERSIONS;

  // Retrieve all existing versions for this resume to calculate unsubmitted count
  const allExistingVersions = await ResumeVersion.find({
    resume: resume._id,
  })
    .sort({ createdAt: 1 })
    .select('_id submitted name createdAt')
    .lean();

  const appRefs = await Application.find({
    resumeVersion: { $in: allExistingVersions.map((v) => v._id) },
  })
    .select('resumeVersion')
    .lean();

  const submittedVersionIdSet = new Set(
    appRefs.map((app) => String(app.resumeVersion))
  );

  const unsubmittedVersions = allExistingVersions.filter(
    (v) => !v.submitted && !submittedVersionIdSet.has(String(v._id))
  );

  let warning = null;

  if (unsubmittedVersions.length >= maxUnsubmitted) {
    // Prune the oldest unsubmitted version
    const oldestUnsubmitted = unsubmittedVersions[0];
    await ResumeVersion.findByIdAndDelete(oldestUnsubmitted._id);
    warning = `Unsubmitted version limit reached (${maxUnsubmitted}). Oldest unsubmitted version "${oldestUnsubmitted.name}" was pruned.`;
  }

  const effectiveResumeData = versionInput.resumeData || resume.data || {};
  const effectiveContentHash =
    versionInput.contentHash ||
    crypto.createHash('sha256').update(JSON.stringify(effectiveResumeData)).digest('hex');

  const newVersion = await ResumeVersion.create({
    student: student._id,
    college: student.college,
    resume: resume._id,
    name: versionInput.name || 'Snapshot',
    source: versionInput.source || 'manual',
    label: versionInput.label || '',
    contentHash: effectiveContentHash,
    templateId: versionInput.templateId || resume.templateId || 'modern',
    resumeData: effectiveResumeData,
    targetRole: versionInput.targetRole || '',
    targetCompany: versionInput.targetCompany || '',
    targetDrive: versionInput.targetDrive || null,
    atsScore: versionInput.atsScore || 0,
    baselineScore: versionInput.baselineScore || 0,
    coverLetter: versionInput.coverLetter || '',
    isDefault: Boolean(versionInput.isDefault),
    jdSnapshot: versionInput.jdSnapshot || null,
    submitted: false,
  });

  return {
    version: newVersion,
    warning,
  };
}

/**
 * POST /resumes/:id/versions/:vid/restore
 * Restores a snapshot by creating a NEW version and updating the Resume document.
 */
async function restoreResumeVersion(resumeId, versionId, student, options = {}) {
  const resume = await getResumeWithOwnershipCheck(resumeId, student);

  if (!mongoose.Types.ObjectId.isValid(versionId)) {
    const err = new Error('Invalid version ID');
    err.statusCode = 400;
    throw err;
  }

  const version = await ResumeVersion.findOne({
    _id: versionId,
    resume: resume._id,
    student: student._id,
  });

  if (!version) {
    const err = new Error('Resume version not found');
    err.statusCode = 404;
    throw err;
  }

  // 1. Update resume document
  resume.data = version.resumeData || {};
  if (version.templateId) {
    resume.templateId = version.templateId;
  }
  resume.draftUpdatedAt = new Date();
  await resume.save();

  // 2. Create a NEW version representing this restored state
  const restoreName = options.name || `Restored from ${version.name}`;
  const { version: newVersion, warning } = await createResumeVersion(resumeId, student, {
    name: restoreName,
    source: 'manual',
    label: `Restored from version ${version._id}`,
    templateId: version.templateId,
    resumeData: version.resumeData,
    targetRole: version.targetRole,
    targetCompany: version.targetCompany,
    targetDrive: version.targetDrive,
    atsScore: version.atsScore,
    baselineScore: version.baselineScore,
    coverLetter: version.coverLetter,
  });

  return {
    message: 'Resume restored and new version snapshot created',
    version: newVersion,
    resume,
    warning,
  };
}

/**
 * DELETE /resumes/:id/versions/:vid
 * Deletes an unsubmitted version.
 * BLOCKS deletion if the version is flagged submitted or referenced by any Application.
 */
async function deleteResumeVersion(resumeId, versionId, student) {
  const resume = await getResumeWithOwnershipCheck(resumeId, student);

  if (!mongoose.Types.ObjectId.isValid(versionId)) {
    const err = new Error('Invalid version ID');
    err.statusCode = 400;
    throw err;
  }

  const version = await ResumeVersion.findOne({
    _id: versionId,
    resume: resume._id,
    student: student._id,
  });

  if (!version) {
    const err = new Error('Resume version not found');
    err.statusCode = 404;
    throw err;
  }

  // Guard: Submitted versions can never be deleted
  if (version.submitted) {
    const err = new Error('Cannot delete a submitted resume version');
    err.statusCode = 400;
    throw err;
  }

  // Guard: Application-referenced versions can never be deleted
  const isReferenced = await Application.exists({ resumeVersion: version._id });
  if (isReferenced) {
    const err = new Error('Cannot delete a resume version referenced by an active application');
    err.statusCode = 400;
    throw err;
  }

  await ResumeVersion.findByIdAndDelete(version._id);

  return {
    message: 'Resume version deleted successfully',
  };
}

/**
 * Phase 11: TPO & Admin list of students' resumes for their college.
 */
async function tpoListStudentResumes(user, query = {}) {
  const userCollegeId =
    user.role === 'superadmin' ? null : (user.college?._id || user.college)?.toString();

  if (user.role !== 'superadmin' && !userCollegeId) {
    const err = new Error('Access denied: user has no associated college');
    err.statusCode = 403;
    throw err;
  }

  const studentQuery = {};
  if (userCollegeId) {
    studentQuery.college = userCollegeId;
  }
  if (query.branch) {
    studentQuery.branch = { $regex: new RegExp(`^${query.branch}$`, 'i') };
  }
  if (query.batchYear) {
    studentQuery.batchYear = query.batchYear;
  }

  let matchingStudentIds = null;
  if (query.search) {
    const userMatches = await User.find({
      $or: [
        { name: { $regex: query.search, $options: 'i' } },
        { email: { $regex: query.search, $options: 'i' } },
      ],
    }).select('_id');
    const userIds = userMatches.map((u) => u._id);

    const searchStudents = await Student.find({
      ...studentQuery,
      $or: [
        { user: { $in: userIds } },
        { enrollmentNo: { $regex: query.search, $options: 'i' } },
      ],
    }).select('_id');

    matchingStudentIds = searchStudents.map((s) => s._id);
  } else if (query.branch || query.batchYear) {
    const filteredStudents = await Student.find(studentQuery).select('_id');
    matchingStudentIds = filteredStudents.map((s) => s._id);
  }

  const resumeQuery = { archived: false };
  if (userCollegeId) {
    resumeQuery.college = userCollegeId;
  }
  if (matchingStudentIds !== null) {
    if (query.search) {
      resumeQuery.$or = [
        { student: { $in: matchingStudentIds } },
        { title: { $regex: query.search, $options: 'i' } },
      ];
    } else {
      resumeQuery.student = { $in: matchingStudentIds };
    }
  }

  const page = Math.max(1, query.page || 1);
  const limit = Math.max(1, Math.min(100, query.limit || 10));
  const skip = (page - 1) * limit;

  const total = await Resume.countDocuments(resumeQuery);
  const resumeDocs = await Resume.find(resumeQuery)
    .populate({
      path: 'student',
      select: 'user college branch batchYear phone enrollmentNo cgpa backlogs placementStatus',
      populate: { path: 'user', select: 'name email role' },
    })
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(limit);

  const resumes = await Promise.all(
    resumeDocs.map(async (doc) => {
      const obj = doc.toObject();
      const latestReview = await ResumeReview.findOne({ resume: doc._id })
        .populate('tpo', 'name email role')
        .sort({ createdAt: -1 });
      const reviewCount = await ResumeReview.countDocuments({ resume: doc._id });
      const submissionCount = await Application.countDocuments({
        student: doc.student?._id,
        'resumeSnapshot.resumeId': doc._id,
      });

      return {
        ...obj,
        latestReview,
        reviewCount,
        submissionCount,
      };
    })
  );

  let filteredResumes = resumes;
  if (query.reviewStatus && query.reviewStatus !== 'all') {
    if (query.reviewStatus === 'unreviewed') {
      filteredResumes = resumes.filter((r) => !r.latestReview);
    } else {
      filteredResumes = resumes.filter((r) => r.latestReview?.status === query.reviewStatus);
    }
  }

  return {
    resumes: filteredResumes,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/**
 * Phase 11: TPO read-only view of a student's resume, submitted versions history, and reviews.
 */
async function tpoGetStudentResume(resumeId, user) {
  if (!mongoose.Types.ObjectId.isValid(resumeId)) {
    const err = new Error('Invalid resume ID');
    err.statusCode = 400;
    throw err;
  }

  const resume = await Resume.findById(resumeId).populate({
    path: 'student',
    select: 'user college branch batchYear phone enrollmentNo cgpa backlogs placementStatus',
    populate: [
      { path: 'user', select: 'name email role' },
      { path: 'college', select: 'name code city state' },
    ],
  });

  if (!resume) {
    const err = new Error('Resume not found');
    err.statusCode = 404;
    throw err;
  }

  // College isolation check
  if (user.role !== 'superadmin') {
    const userCollegeId = (user.college?._id || user.college)?.toString();
    const resumeCollegeId = (resume.college?._id || resume.college)?.toString();
    if (!userCollegeId || userCollegeId !== resumeCollegeId) {
      const err = new Error('Access denied: college mismatch');
      err.statusCode = 403;
      throw err;
    }
  }

  // Fetch applications where this resume was submitted
  const submittedApplications = await Application.find({
    student: resume.student?._id,
    'resumeSnapshot.resumeId': resume._id,
  })
    .populate({
      path: 'drive',
      select: 'role company location packageLpa driveDate status',
      populate: { path: 'company', select: 'name industry' },
    })
    .populate('resumeVersion', 'name templateId source createdAt submitted contentHash')
    .sort({ appliedOn: -1 });

  // Fetch reviews for this resume
  const reviews = await ResumeReview.find({ resume: resume._id })
    .populate('tpo', 'name email role')
    .sort({ createdAt: -1 });

  // Fetch all versions for this resume
  const versions = await ResumeVersion.find({ resume: resume._id })
    .select('_id name templateId source submitted targetDrive createdAt updatedAt')
    .populate({
      path: 'targetDrive',
      select: 'role company',
      populate: { path: 'company', select: 'name' },
    })
    .sort({ createdAt: -1 });

  return {
    resume,
    submittedApplications,
    reviews,
    versions,
  };
}

/**
 * Phase 11: TPO leaves feedback/review on a student's resume.
 */
async function tpoCreateResumeReview(resumeId, user, { comment, status }) {
  if (!mongoose.Types.ObjectId.isValid(resumeId)) {
    const err = new Error('Invalid resume ID');
    err.statusCode = 400;
    throw err;
  }

  const resume = await Resume.findById(resumeId);
  if (!resume) {
    const err = new Error('Resume not found');
    err.statusCode = 404;
    throw err;
  }

  // College isolation check
  if (user.role !== 'superadmin') {
    const userCollegeId = (user.college?._id || user.college)?.toString();
    const resumeCollegeId = (resume.college?._id || resume.college)?.toString();
    if (!userCollegeId || userCollegeId !== resumeCollegeId) {
      const err = new Error('Access denied: college mismatch');
      err.statusCode = 403;
      throw err;
    }
  }

  const review = await ResumeReview.create({
    resume: resume._id,
    student: resume.student,
    tpo: user._id,
    college: resume.college,
    comment: comment.trim(),
    status: status || 'needs_revision',
  });

  const populatedReview = await ResumeReview.findById(review._id).populate(
    'tpo',
    'name email role'
  );

  try {
    const studentDoc = await Student.findById(resume.student).select('user');
    if (studentDoc && studentDoc.user) {
      const { createNotification } = require('../../utils/notificationService');
      const statusLabel = (status || 'needs_revision').replace(/_/g, ' ');
      await createNotification({
        user: studentDoc.user,
        type: 'general',
        message: `Your resume "${resume.title || 'Resume'}" was reviewed by TPO and marked as "${statusLabel}".`,
        link: `/student/resume-studio/${resume._id}`,
      });
    }
  } catch (notifErr) {
    console.error('Failed to dispatch TPO review notification to student:', notifErr.message);
  }

  return populatedReview;
}

/**
 * Phase 11: Get reviews for a resume (accessible by owner student and same-college TPO/admin).
 */
async function getResumeReviewsForUser(resumeId, user) {
  if (!mongoose.Types.ObjectId.isValid(resumeId)) {
    const err = new Error('Invalid resume ID');
    err.statusCode = 400;
    throw err;
  }

  const resume = await Resume.findById(resumeId);
  if (!resume) {
    const err = new Error('Resume not found');
    err.statusCode = 404;
    throw err;
  }

  // Recruiter: strictly denied
  if (user.role === 'recruiter') {
    const err = new Error('Access denied: recruiters cannot access resume reviews');
    err.statusCode = 403;
    throw err;
  }

  // Student: must be the owner of the resume
  if (user.role === 'student') {
    const student = await Student.findOne({ user: user._id });
    if (!student || String(resume.student) !== String(student._id)) {
      const err = new Error('Access denied: you do not own this resume');
      err.statusCode = 403;
      throw err;
    }
  } else if (user.role !== 'superadmin') {
    // TPO / admin: must be from the same college
    const userCollegeId = (user.college?._id || user.college)?.toString();
    const resumeCollegeId = (resume.college?._id || resume.college)?.toString();
    if (!userCollegeId || userCollegeId !== resumeCollegeId) {
      const err = new Error('Access denied: college mismatch');
      err.statusCode = 403;
      throw err;
    }
  }

  const reviews = await ResumeReview.find({ resume: resume._id })
    .populate('tpo', 'name email role')
    .sort({ createdAt: -1 });

  return {
    reviews,
    count: reviews.length,
  };
}

/**
 * Computes missing fields in resume data
 */
function computeMissingFields(resumeData = {}) {
  const missing = [];
  const contact = resumeData.contact || {};

  if (!contact.fullName || !contact.fullName.trim()) missing.push('fullName');
  if (!contact.email || !contact.email.trim()) missing.push('email');
  if (!contact.phone || !contact.phone.trim()) missing.push('phone');
  if (!contact.location || !contact.location.trim()) missing.push('location');
  if (!resumeData.summary || !resumeData.summary.trim()) missing.push('summary');

  const skills = Array.isArray(resumeData.skills) ? resumeData.skills : [];
  const hasSkills = skills.some((c) => {
    if (typeof c === 'string') return c.trim().length > 0;
    return Array.isArray(c.items) && c.items.length > 0;
  });
  if (!hasSkills) missing.push('skills');

  if (!Array.isArray(resumeData.experience) || resumeData.experience.length === 0) {
    missing.push('experience');
  }
  if (!Array.isArray(resumeData.projects) || resumeData.projects.length === 0) {
    missing.push('projects');
  }
  if (!Array.isArray(resumeData.education) || resumeData.education.length === 0) {
    missing.push('education');
  }

  return missing;
}

module.exports = {
  DEFAULT_MAX_UNSUBMITTED_VERSIONS,
  computeMissingFields,
  getStudentProfile,
  getResumeWithOwnershipCheck,
  isVersionSubmittedOrReferenced,
  listResumes,
  createResume,
  getResume,
  updateResume,
  archiveResume,
  unarchiveResume,
  trashResume,
  listTrashResumes,
  restoreTrashResume,
  duplicateResume,
  setPrimaryResume,
  listResumeVersions,
  createResumeVersion,
  restoreResumeVersion,
  deleteResumeVersion,
  tpoListStudentResumes,
  tpoGetStudentResume,
  tpoCreateResumeReview,
  getResumeReviewsForUser,
};
