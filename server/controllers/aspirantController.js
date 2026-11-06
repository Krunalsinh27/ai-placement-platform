const mongoose = require('mongoose');
const { Aspirant, College, Student, Offer } = require('../models');
const { INDIAN_STATES_AND_UTS } = require('../utils/constants');

/**
 * Small-group privacy suppression helper:
 * Groups with < 5 students return 'lt5' with salary stats suppressed
 */
const suppressCount = (count) => {
  if (typeof count === 'number' && count > 0 && count < 5) {
    return 'lt5';
  }
  return count;
};

/**
 * Calculate highest & average package from accepted offers
 */
const calculatePackageStats = (packages) => {
  if (!packages || packages.length === 0) {
    return { highestPackage: 0, averagePackage: 0 };
  }
  const sorted = [...packages].sort((a, b) => a - b);
  const highest = sorted[sorted.length - 1];
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const average = Number((sum / sorted.length).toFixed(2));
  return { highestPackage: highest, averagePackage: average };
};

/**
 * Helper to compute privacy-protected benchmark metrics for a list of approved colleges
 */
const buildCollegeCards = async (collegeDocs) => {
  if (!collegeDocs || collegeDocs.length === 0) return [];

  const collegeIds = collegeDocs.map((c) => c._id);

  // Fetch only non-PII grouping attributes
  const students = await Student.find({ college: { $in: collegeIds } })
    .select('_id college branch batchYear')
    .lean();

  const studentIds = students.map((s) => s._id);

  const acceptedOffers = await Offer.find({
    status: 'accepted',
    student: { $in: studentIds },
  })
    .select('student college packageLpa status')
    .lean();

  const placedStudentSet = new Set(acceptedOffers.map((o) => o.student.toString()));

  return collegeDocs.map((college) => {
    const cStudents = students.filter(
      (s) => s.college.toString() === college._id.toString()
    );
    const totalCount = cStudents.length;
    const placedCount = cStudents.filter((s) =>
      placedStudentSet.has(s._id.toString())
    ).length;

    const cOffers = acceptedOffers.filter((o) =>
      cStudents.some((s) => s._id.toString() === o.student.toString())
    );
    const cPackages = cOffers.map((o) => o.packageLpa).filter((p) => typeof p === 'number');

    const isSubgroupSmall = totalCount > 0 && totalCount < 5;
    const isPlacedSubgroupSmall = placedCount > 0 && placedCount < 5;

    // Aggregate by branch with small-group privacy suppression
    const branchMap = new Map();
    for (const student of cStudents) {
      const br = student.branch || 'Unknown';
      if (!branchMap.has(br)) {
        branchMap.set(br, { total: 0, placed: 0, packages: [] });
      }
      const entry = branchMap.get(br);
      entry.total += 1;
      if (placedStudentSet.has(student._id.toString())) {
        entry.placed += 1;
      }
    }

    for (const offer of cOffers) {
      const student = cStudents.find((s) => s._id.toString() === offer.student.toString());
      if (student && typeof offer.packageLpa === 'number') {
        const br = student.branch || 'Unknown';
        if (branchMap.has(br)) {
          branchMap.get(br).packages.push(offer.packageLpa);
        }
      }
    }

    const byBranch = Array.from(branchMap.entries()).map(([branch, data]) => {
      const isBrSmall = data.total > 0 && data.total < 5;
      const isBrPlacedSmall = data.placed > 0 && data.placed < 5;
      const branchStats = calculatePackageStats(data.packages);
      return {
        branch,
        students: isBrSmall ? 'lt5' : data.total,
        totalStudents: isBrSmall ? 'lt5' : data.total,
        placed: isBrSmall || isBrPlacedSmall ? 'lt5' : data.placed,
        placementPercentage:
          isBrSmall || isBrPlacedSmall
            ? 'lt5'
            : data.total > 0
            ? Number(((data.placed / data.total) * 100).toFixed(1))
            : 0,
        averagePackage: isBrSmall || isBrPlacedSmall ? null : branchStats.averagePackage,
        highestPackage: isBrSmall || isBrPlacedSmall ? null : branchStats.highestPackage,
      };
    });

    if (isSubgroupSmall || isPlacedSubgroupSmall) {
      return {
        _id: college._id,
        name: college.name,
        code: college.code,
        city: college.city,
        state: college.state,
        website: college.website,
        accreditation: college.accreditation,
        students: isSubgroupSmall ? 'lt5' : totalCount,
        totalStudents: isSubgroupSmall ? 'lt5' : totalCount,
        placed: 'lt5',
        placementPercentage: 'lt5',
        averagePackage: null,
        highestPackage: null,
        byBranch,
      };
    }

    const rate = totalCount > 0 ? Number(((placedCount / totalCount) * 100).toFixed(1)) : 0;
    const { highestPackage, averagePackage } = calculatePackageStats(cPackages);

    return {
      _id: college._id,
      name: college.name,
      code: college.code,
      city: college.city,
      state: college.state,
      website: college.website,
      accreditation: college.accreditation,
      students: totalCount,
      totalStudents: totalCount,
      placed: placedCount,
      placementPercentage: rate,
      averagePackage: cPackages.length > 0 ? averagePackage : null,
      highestPackage: cPackages.length > 0 ? highestPackage : null,
      byBranch,
    };
  });
};

/**
 * @desc    Get current aspirant profile & preferences
 * @route   GET /api/aspirant/me
 * @access  Private (Aspirant only)
 */
const getAspirantProfile = async (req, res, next) => {
  try {
    let aspirant = await Aspirant.findOne({ user: req.user._id })
      .populate('user', '_id name email role')
      .populate('shortlistedColleges', '_id name code city state website accreditation')
      .lean();

    if (!aspirant) {
      // Auto-create if missing for verified aspirant user
      const created = await Aspirant.create({
        user: req.user._id,
        state: '',
        interestedBranches: [],
        twelfthStream: '',
        shortlistedColleges: [],
        savedComparisons: [],
      });
      aspirant = created.toObject();
    }

    const userPayload = {
      _id: req.user._id,
      name: req.user.name || (aspirant.user && typeof aspirant.user === 'object' ? aspirant.user.name : '') || '',
      email: req.user.email || (aspirant.user && typeof aspirant.user === 'object' ? aspirant.user.email : '') || '',
      role: req.user.role || 'aspirant',
    };

    res.status(200).json({
      success: true,
      user: userPayload,
      aspirant: {
        ...aspirant,
        user: userPayload,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update aspirant preferences
 * @route   PUT /api/aspirant/me
 * @access  Private (Aspirant only)
 */
const updateAspirantProfile = async (req, res, next) => {
  try {
    const { state, interestedBranches, twelfthStream } = req.body;

    let aspirant = await Aspirant.findOne({ user: req.user._id });
    if (!aspirant) {
      aspirant = new Aspirant({ user: req.user._id });
    }

    // Validation: Never overwrite saved values with empty strings
    if (state !== undefined && String(state).trim() !== '') {
      aspirant.state = String(state).trim();
    }

    if (twelfthStream !== undefined && String(twelfthStream).trim() !== '') {
      aspirant.twelfthStream = String(twelfthStream).trim();
    }

    if (interestedBranches !== undefined) {
      const parsedBranches = Array.isArray(interestedBranches)
        ? interestedBranches.map((s) => String(s).trim()).filter(Boolean)
        : typeof interestedBranches === 'string'
        ? interestedBranches.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      // Never overwrite with an empty branch array if user already has saved branches
      if (parsedBranches.length > 0) {
        aspirant.interestedBranches = parsedBranches;
      }
    }

    await aspirant.save();

    const userPayload = {
      _id: req.user._id,
      name: req.user.name || '',
      email: req.user.email || '',
      role: req.user.role || 'aspirant',
    };

    res.status(200).json({
      success: true,
      message: 'Preferences updated successfully',
      user: userPayload,
      aspirant: {
        ...aspirant.toObject(),
        user: userPayload,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Add college to aspirant shortlist
 * @route   POST /api/aspirant/shortlist/:collegeId
 * @access  Private (Aspirant only)
 */
const addToShortlist = async (req, res, next) => {
  try {
    const { collegeId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(collegeId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid college ID',
      });
    }

    // Verify college exists and is approved
    const college = await College.findOne({ _id: collegeId, status: 'approved' });
    if (!college) {
      return res.status(404).json({
        success: false,
        message: 'Approved college not found',
      });
    }

    let aspirant = await Aspirant.findOne({ user: req.user._id });
    if (!aspirant) {
      aspirant = new Aspirant({ user: req.user._id, shortlistedColleges: [] });
    }

    const collegeObjId = new mongoose.Types.ObjectId(collegeId);
    const alreadyShortlisted = aspirant.shortlistedColleges.some(
      (id) => id.toString() === collegeId
    );

    if (!alreadyShortlisted) {
      aspirant.shortlistedColleges.push(collegeObjId);
      await aspirant.save();
    }

    res.status(200).json({
      success: true,
      message: `${college.name} added to your shortlist`,
      shortlistedColleges: aspirant.shortlistedColleges,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Remove college from aspirant shortlist
 * @route   DELETE /api/aspirant/shortlist/:collegeId
 * @access  Private (Aspirant only)
 */
const removeFromShortlist = async (req, res, next) => {
  try {
    const { collegeId } = req.params;

    let aspirant = await Aspirant.findOne({ user: req.user._id });
    if (!aspirant) {
      return res.status(200).json({
        success: true,
        message: 'College removed from shortlist',
        shortlistedColleges: [],
      });
    }

    aspirant.shortlistedColleges = aspirant.shortlistedColleges.filter(
      (id) => id.toString() !== collegeId
    );
    await aspirant.save();

    res.status(200).json({
      success: true,
      message: 'College removed from shortlist',
      shortlistedColleges: aspirant.shortlistedColleges,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get shortlisted colleges with privacy-protected placement aggregates
 * @route   GET /api/aspirant/shortlist
 * @access  Private (Aspirant only)
 */
const getShortlist = async (req, res, next) => {
  try {
    const aspirant = await Aspirant.findOne({ user: req.user._id }).lean();
    if (!aspirant || !aspirant.shortlistedColleges || aspirant.shortlistedColleges.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        colleges: [],
      });
    }

    // Only approved colleges
    const colleges = await College.find({
      _id: { $in: aspirant.shortlistedColleges },
      status: 'approved',
    })
      .select('_id name code city state website accreditation')
      .lean();

    const collegeCards = await buildCollegeCards(colleges);

    res.status(200).json({
      success: true,
      count: collegeCards.length,
      colleges: collegeCards,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get saved comparisons for current aspirant
 * @route   GET /api/aspirant/comparisons
 * @access  Private (Aspirant only)
 */
const getSavedComparisons = async (req, res, next) => {
  try {
    const aspirant = await Aspirant.findOne({ user: req.user._id })
      .populate({
        path: 'savedComparisons.colleges',
        select: '_id name code city state website accreditation status',
        match: { status: 'approved' },
      })
      .lean();

    if (!aspirant || !aspirant.savedComparisons) {
      return res.status(200).json({
        success: true,
        comparisons: [],
      });
    }

    // Process each comparison and attach privacy-protected aggregate cards
    const processedComparisons = await Promise.all(
      aspirant.savedComparisons.map(async (comp) => {
        const validColleges = (comp.colleges || []).filter((c) => c && c.status === 'approved');
        const collegeCards = await buildCollegeCards(validColleges);
        return {
          _id: comp._id,
          name: comp.name,
          createdAt: comp.createdAt,
          colleges: collegeCards,
        };
      })
    );

    res.status(200).json({
      success: true,
      comparisons: processedComparisons,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get filter options (states, batchYears, branches) for aspirants
 * @route   GET /api/aspirant/filters
 * @access  Private (Aspirant only)
 */
const getAspirantFilterOptions = async (req, res, next) => {
  try {
    const colleges = await College.find({ status: 'approved' }).select('state').lean();
    const stateCounts = {};
    for (const c of colleges) {
      if (c.state) {
        const raw = c.state.trim();
        const canonical =
          INDIAN_STATES_AND_UTS.find((s) => s.toLowerCase() === raw.toLowerCase()) || raw;
        stateCounts[canonical] = (stateCounts[canonical] || 0) + 1;
      }
    }

    const states = INDIAN_STATES_AND_UTS.map((st) => ({
      state: st,
      count: stateCounts[st] || 0,
    }));

    const students = await Student.find({}).select('batchYear branch').lean();
    const batchYears = Array.from(
      new Set(students.map((s) => s.batchYear).filter((y) => typeof y === 'number'))
    ).sort((a, b) => b - a);

    const branches = ['CSE', 'IT', 'ECE', 'EE', 'ME', 'CE', 'AI & DS', 'Chemical'];

    res.status(200).json({
      success: true,
      states,
      statesList: INDIAN_STATES_AND_UTS,
      batchYears,
      branches,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Save a comparison (up to 3 colleges)
 * @route   POST /api/aspirant/comparisons
 * @access  Private (Aspirant only)
 */
const saveComparison = async (req, res, next) => {
  try {
    const { name } = req.body;
    const colleges = req.body.colleges || req.body.collegeIds;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'A comparison name is required',
      });
    }

    if (!Array.isArray(colleges) || colleges.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one college must be selected for comparison',
      });
    }

    if (colleges.length > 3) {
      return res.status(400).json({
        success: false,
        message: 'A comparison can have at most 3 colleges',
      });
    }

    // Validate that all college IDs exist and are approved
    const validCollegeIds = colleges
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    if (validCollegeIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid college IDs provided',
      });
    }

    const approvedColleges = await College.find({
      _id: { $in: validCollegeIds },
      status: 'approved',
    }).select('_id');

    if (approvedColleges.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'None of the selected colleges are approved or available for comparison',
      });
    }

    let aspirant = await Aspirant.findOne({ user: req.user._id });
    if (!aspirant) {
      aspirant = new Aspirant({ user: req.user._id, savedComparisons: [] });
    }

    const newComparison = {
      name: name.trim(),
      colleges: approvedColleges.map((c) => c._id),
      createdAt: new Date(),
    };

    aspirant.savedComparisons.push(newComparison);
    await aspirant.save();

    const createdComp = aspirant.savedComparisons[aspirant.savedComparisons.length - 1];

    // Reload and return populated comparisons
    const updatedAspirant = await Aspirant.findOne({ user: req.user._id })
      .populate({
        path: 'savedComparisons.colleges',
        select: '_id name code city state website accreditation status',
        match: { status: 'approved' },
      })
      .lean();

    const processedComparisons = await Promise.all(
      (updatedAspirant?.savedComparisons || []).map(async (comp) => {
        const validColleges = (comp.colleges || []).filter((c) => c && c.status === 'approved');
        const collegeCards = await buildCollegeCards(validColleges);
        return {
          _id: comp._id,
          name: comp.name,
          createdAt: comp.createdAt,
          colleges: collegeCards,
        };
      })
    );

    res.status(201).json({
      success: true,
      message: 'Comparison saved successfully',
      comparison: createdComp,
      comparisons: processedComparisons,
      savedComparisons: processedComparisons,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a saved comparison
 * @route   DELETE /api/aspirant/comparisons/:id
 * @access  Private (Aspirant only)
 */
const deleteComparison = async (req, res, next) => {
  try {
    const { id } = req.params;

    let aspirant = await Aspirant.findOne({ user: req.user._id });
    if (!aspirant) {
      return res.status(404).json({
        success: false,
        message: 'Aspirant profile not found',
      });
    }

    aspirant.savedComparisons = aspirant.savedComparisons.filter(
      (comp) => comp._id.toString() !== id
    );
    await aspirant.save();

    // Reload and return populated comparisons
    const updatedAspirant = await Aspirant.findOne({ user: req.user._id })
      .populate({
        path: 'savedComparisons.colleges',
        select: '_id name code city state website accreditation status',
        match: { status: 'approved' },
      })
      .lean();

    const processedComparisons = await Promise.all(
      (updatedAspirant?.savedComparisons || []).map(async (comp) => {
        const validColleges = (comp.colleges || []).filter((c) => c && c.status === 'approved');
        const collegeCards = await buildCollegeCards(validColleges);
        return {
          _id: comp._id,
          name: comp.name,
          createdAt: comp.createdAt,
          colleges: collegeCards,
        };
      })
    );

    res.status(200).json({
      success: true,
      message: 'Saved comparison deleted successfully',
      comparisons: processedComparisons,
      savedComparisons: processedComparisons,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get recommended colleges tailored to aspirant's preferences
 * @route   GET /api/aspirant/recommendations
 * @access  Private (Aspirant only)
 */
const getRecommendations = async (req, res, next) => {
  try {
    const aspirant = await Aspirant.findOne({ user: req.user._id }).lean();
    if (!aspirant || !aspirant.interestedBranches || aspirant.interestedBranches.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        preferences: {
          state: aspirant?.state || '',
          twelfthStream: aspirant?.twelfthStream || '',
          interestedBranches: [],
        },
        colleges: [],
      });
    }

    const myBranches = aspirant.interestedBranches;
    const homeState = aspirant.state ? aspirant.state.trim().toLowerCase() : '';
    const twelfthStream = aspirant.twelfthStream || '';

    // Only approved colleges
    const colleges = await College.find({ status: 'approved' })
      .select('_id name code city state website accreditation')
      .lean();

    const collegeIds = colleges.map((c) => c._id);

    // Fetch students without any personal information (only _id, college, branch)
    const students = await Student.find({ college: { $in: collegeIds } })
      .select('_id college branch')
      .lean();

    const studentIds = students.map((s) => s._id);

    // Fetch accepted offers only
    const acceptedOffers = await Offer.find({
      status: 'accepted',
      student: { $in: studentIds },
    })
      .select('student college packageLpa')
      .lean();

    // Unique placed students set
    const placedStudentSet = new Set(acceptedOffers.map((o) => o.student.toString()));

    const processedColleges = [];

    for (const college of colleges) {
      const isHomeState = Boolean(
        homeState && college.state && college.state.trim().toLowerCase() === homeState
      );

      const cStudents = students.filter(
        (s) => s.college.toString() === college._id.toString()
      );

      // If college has 0 students:
      if (cStudents.length === 0) {
        if (isHomeState) {
          processedColleges.push({
            _id: college._id,
            name: college.name,
            code: college.code,
            city: college.city,
            state: college.state,
            website: college.website,
            accreditation: college.accreditation,
            isHomeState: true,
            hasSufficientData: false,
            note: 'Not enough branch data to show yet',
            avgBranchPlacementRate: null,
            avgBranchPackage: null,
            overallPlacementPercentage: 'lt5',
            overallAveragePackage: null,
            overallTotalStudents: 'lt5',
            myBranchStats: [],
          });
        }
        continue;
      }

      // Check if college offers at least one of the aspirant's interested branches
      const collegeBranchMap = new Map();
      for (const s of cStudents) {
        const brUpper = (s.branch || '').toUpperCase();
        if (!collegeBranchMap.has(brUpper)) {
          collegeBranchMap.set(brUpper, []);
        }
        collegeBranchMap.get(brUpper).push(s);
      }

      const matchingBranchNames = myBranches.filter((br) =>
        collegeBranchMap.has(br.toUpperCase())
      );

      // Only colleges that have students in at least one of my interested branches,
      // UNLESS it's an approved college in the home state with too little branch data
      if (matchingBranchNames.length === 0) {
        if (isHomeState) {
          processedColleges.push({
            _id: college._id,
            name: college.name,
            code: college.code,
            city: college.city,
            state: college.state,
            website: college.website,
            accreditation: college.accreditation,
            isHomeState: true,
            hasSufficientData: false,
            note: 'Not enough branch data to show yet',
            avgBranchPlacementRate: null,
            avgBranchPackage: null,
            overallPlacementPercentage: cStudents.length < 5 ? 'lt5' : 0,
            overallAveragePackage: null,
            overallTotalStudents: cStudents.length < 5 ? 'lt5' : cStudents.length,
            myBranchStats: [],
          });
        }
        continue;
      }

      // Compute branch-level statistics for the aspirant's branches
      const myBranchStats = [];
      const validPlacementRates = [];
      const validPackages = [];

      for (const brName of matchingBranchNames) {
        const brStudents = collegeBranchMap.get(brName.toUpperCase()) || [];
        const totalCount = brStudents.length;
        const placedCount = brStudents.filter((s) =>
          placedStudentSet.has(s._id.toString())
        ).length;

        const brOffers = acceptedOffers.filter((o) =>
          brStudents.some((s) => s._id.toString() === o.student.toString())
        );
        const brPackages = brOffers
          .map((o) => o.packageLpa)
          .filter((p) => typeof p === 'number');

        // Small-group privacy suppression rule (< 5 students)
        const isSmallGroup = (totalCount > 0 && totalCount < 5) || (placedCount > 0 && placedCount < 5);

        let rate = 0;
        let avgPkg = null;

        if (isSmallGroup) {
          myBranchStats.push({
            branch: brName,
            totalStudents: 'lt5',
            students: 'lt5',
            placed: 'lt5',
            placementPercentage: 'lt5',
            averagePackage: null,
            isSmallGroup: true,
          });
        } else {
          rate = totalCount > 0 ? Number(((placedCount / totalCount) * 100).toFixed(1)) : 0;
          if (brPackages.length > 0) {
            avgPkg = Number(
              (brPackages.reduce((sum, p) => sum + p, 0) / brPackages.length).toFixed(2)
            );
            validPackages.push(avgPkg);
          }
          validPlacementRates.push(rate);

          myBranchStats.push({
            branch: brName,
            totalStudents: totalCount,
            students: totalCount,
            placed: placedCount,
            placementPercentage: rate,
            averagePackage: avgPkg,
            isSmallGroup: false,
          });
        }
      }

      // Check whether there is sufficient data across my branches
      const hasSufficientData = validPlacementRates.length > 0;
      const avgBranchPlacementRate = hasSufficientData
        ? Number(
            (
              validPlacementRates.reduce((sum, r) => sum + r, 0) /
              validPlacementRates.length
            ).toFixed(1)
          )
        : null;

      const avgBranchPackage =
        validPackages.length > 0
          ? Number(
              (
                validPackages.reduce((sum, p) => sum + p, 0) /
                validPackages.length
              ).toFixed(2)
            )
          : null;

      // Overall college stats
      const totalCollegeStudents = cStudents.length;
      const totalPlacedCollegeStudents = cStudents.filter((s) =>
        placedStudentSet.has(s._id.toString())
      ).length;
      const isCollegeSmall =
        (totalCollegeStudents > 0 && totalCollegeStudents < 5) ||
        (totalPlacedCollegeStudents > 0 && totalPlacedCollegeStudents < 5);

      const allCollegePackages = acceptedOffers
        .filter((o) => cStudents.some((s) => s._id.toString() === o.student.toString()))
        .map((o) => o.packageLpa)
        .filter((p) => typeof p === 'number');

      const overallPlacementPercentage = isCollegeSmall
        ? 'lt5'
        : totalCollegeStudents > 0
        ? Number(((totalPlacedCollegeStudents / totalCollegeStudents) * 100).toFixed(1))
        : 0;

      const overallAveragePackage = isCollegeSmall
        ? null
        : allCollegePackages.length > 0
        ? Number(
            (
              allCollegePackages.reduce((sum, p) => sum + p, 0) /
              allCollegePackages.length
            ).toFixed(2)
          )
        : null;

      processedColleges.push({
        _id: college._id,
        name: college.name,
        code: college.code,
        city: college.city,
        state: college.state,
        website: college.website,
        accreditation: college.accreditation,
        isHomeState,
        hasSufficientData,
        avgBranchPlacementRate,
        avgBranchPackage,
        overallPlacementPercentage,
        overallAveragePackage,
        overallTotalStudents: isCollegeSmall ? 'lt5' : totalCollegeStudents,
        myBranchStats,
      });
    }

    // Split into ranked (sufficient data) and unranked (not enough branch data to show)
    const ranked = processedColleges.filter((c) => c.hasSufficientData);
    const unranked = processedColleges.filter((c) => !c.hasSufficientData);

    // Sorting ranked:
    // 1. Higher avgBranchPlacementRate
    // 2. Tie-break: Higher avgBranchPackage
    // 3. Tie-break: Home state ranks first
    // 4. Alphabetical by name
    ranked.sort((a, b) => {
      if (Math.abs(b.avgBranchPlacementRate - a.avgBranchPlacementRate) > 0.001) {
        return b.avgBranchPlacementRate - a.avgBranchPlacementRate;
      }
      const pkgA = a.avgBranchPackage || 0;
      const pkgB = b.avgBranchPackage || 0;
      if (Math.abs(pkgB - pkgA) > 0.001) {
        return pkgB - pkgA;
      }
      if (a.isHomeState !== b.isHomeState) {
        return a.isHomeState ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    // Unranked: home state first, then name
    unranked.sort((a, b) => {
      if (a.isHomeState !== b.isHomeState) {
        return a.isHomeState ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    const hasHomeStateRankedMatches = ranked.some((c) => c.isHomeState);
    const inStateCollegesWithoutData = unranked.filter((c) => c.isHomeState);

    const finalColleges = [...ranked, ...unranked];

    res.status(200).json({
      success: true,
      count: finalColleges.length,
      preferences: {
        state: aspirant.state || '',
        twelfthStream,
        interestedBranches: myBranches,
      },
      homeState: aspirant.state || '',
      hasHomeStateRankedMatches,
      inStateCollegesWithoutData,
      colleges: finalColleges,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAspirantProfile,
  updateAspirantProfile,
  addToShortlist,
  removeFromShortlist,
  getShortlist,
  getSavedComparisons,
  saveComparison,
  deleteComparison,
  getAspirantFilterOptions,
  getRecommendations,
};

