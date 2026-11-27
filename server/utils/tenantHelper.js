const mongoose = require('mongoose');

/**
 * Tenant Isolation & Scope Enforcer Helper
 *
 * Guarantees that multi-tenant database queries and resource authorizations
 * derive tenant scope strictly from the authenticated user's server-side session.
 * Client-supplied college IDs in query parameters or request bodies are strictly
 * prevented from overriding tenant scope unless the requester is an authorized global superadmin.
 */

/**
 * Extracts and enforces the authorized tenant scope for a given request/user.
 *
 * @param {Object} req - Express request object containing req.user
 * @param {Object} [options={}] - Additional options
 * @param {string} [options.collegeKey='college'] - The model field name representing college
 * @param {string} [options.companyKey='company'] - The model field name representing company
 * @returns {{
 *   isGlobalAdmin: boolean,
 *   collegeId: mongoose.Types.ObjectId | null,
 *   companyId: mongoose.Types.ObjectId | null,
 *   filter: Object
 * }}
 */
function getTenantScope(req, options = {}) {
  const user = req.user;
  if (!user) {
    const err = new Error('Authentication required for tenant scoping');
    err.status = 401;
    err.statusCode = 401;
    throw err;
  }

  const role = String(user.role || '').toLowerCase();
  const collegeKey = options.collegeKey || 'college';
  const companyKey = options.companyKey || 'company';

  // 1. Global Superadmin: Unconstrained unless explicitly filtering by a target college
  if (role === 'superadmin') {
    const targetCollegeId = req.query?.collegeId || req.body?.collegeId || options.targetCollegeId;
    if (targetCollegeId && mongoose.Types.ObjectId.isValid(targetCollegeId)) {
      const colObjId = new mongoose.Types.ObjectId(targetCollegeId);
      return {
        isGlobalAdmin: true,
        collegeId: colObjId,
        companyId: null,
        filter: { [collegeKey]: colObjId },
      };
    }
    return {
      isGlobalAdmin: true,
      collegeId: null,
      companyId: null,
      filter: {},
    };
  }

  // 2. College Administrators (TPO and legacy Admin role)
  if (role === 'tpo' || role === 'admin') {
    const userCollegeId = user.college?._id || user.college;
    if (!userCollegeId || !mongoose.Types.ObjectId.isValid(userCollegeId)) {
      const err = new Error('Forbidden: User account is not associated with an approved college');
      err.status = 403;
      err.statusCode = 403;
      throw err;
    }

    const colObjId = new mongoose.Types.ObjectId(userCollegeId);
    // Ignore any client-supplied collegeId in req.query or req.body to prevent privilege escalation
    return {
      isGlobalAdmin: false,
      collegeId: colObjId,
      companyId: null,
      filter: { [collegeKey]: colObjId },
    };
  }

  // 3. Recruiters: Scoped strictly to their corporate entity
  if (role === 'recruiter') {
    const userCompanyId = user.company?._id || user.company;
    if (!userCompanyId || !mongoose.Types.ObjectId.isValid(userCompanyId)) {
      const err = new Error('Forbidden: Recruiter account is not associated with a company');
      err.status = 403;
      err.statusCode = 403;
      throw err;
    }

    const compObjId = new mongoose.Types.ObjectId(userCompanyId);
    return {
      isGlobalAdmin: false,
      collegeId: null,
      companyId: compObjId,
      filter: { [companyKey]: compObjId },
    };
  }

  // 4. Students: Scoped to their college and individual identity
  if (role === 'student') {
    const student = req.student || user.student;
    const userCollegeId = student?.college?._id || student?.college || user.college?._id || user.college;
    const colObjId = userCollegeId && mongoose.Types.ObjectId.isValid(userCollegeId)
      ? new mongoose.Types.ObjectId(userCollegeId)
      : null;

    return {
      isGlobalAdmin: false,
      collegeId: colObjId,
      companyId: null,
      filter: colObjId ? { [collegeKey]: colObjId } : {},
    };
  }

  // Fallback for any other authenticated role (e.g. analyst, aspirant)
  return {
    isGlobalAdmin: false,
    collegeId: null,
    companyId: null,
    filter: {},
  };
}

/**
 * Asserts that a target resource belongs to the same college tenant as the authenticated user.
 *
 * @param {Object} resource - Target document or object
 * @param {Object} user - Authenticated req.user
 * @param {string} [collegeField='college'] - Field name on resource containing college ObjectId
 * @throws {Error} 403 if tenant mismatch
 */
function assertTenantAccess(resource, user, collegeField = 'college') {
  if (!user) {
    const err = new Error('Authentication required');
    err.status = 401;
    err.statusCode = 401;
    throw err;
  }

  // Superadmins bypass tenant-level restriction
  if (user.role === 'superadmin') return true;

  if (!resource) {
    const err = new Error('Resource not found');
    err.status = 404;
    err.statusCode = 404;
    throw err;
  }

  const rawResCollege = resource[collegeField]?._id || resource[collegeField];
  const resourceCollegeId = rawResCollege ? rawResCollege.toString() : null;

  const rawUserCollege = user.college?._id || user.college;
  const userCollegeId = rawUserCollege ? rawUserCollege.toString() : null;

  if (!resourceCollegeId || !userCollegeId || resourceCollegeId !== userCollegeId) {
    const err = new Error('Forbidden: Cross-tenant resource access is prohibited');
    err.status = 403;
    err.statusCode = 403;
    throw err;
  }

  return true;
}

/**
 * Asserts that a target resource belongs directly to the authenticated student.
 *
 * @param {Object} resource - Target document or object
 * @param {Object} user - Authenticated req.user
 * @param {string} [userField='user'] - Field name on resource containing user ObjectId
 * @param {string} [studentField='student'] - Field name on resource containing student ObjectId
 * @throws {Error} 403 if ownership mismatch
 */
function assertResourceOwner(resource, user, userField = 'user', studentField = 'student') {
  if (!user) {
    const err = new Error('Authentication required');
    err.status = 401;
    err.statusCode = 401;
    throw err;
  }

  // Superadmins bypass ownership restriction for administrative oversight
  if (user.role === 'superadmin') return true;

  if (!resource) {
    const err = new Error('Resource not found');
    err.status = 404;
    err.statusCode = 404;
    throw err;
  }

  const reqUserId = user._id ? user._id.toString() : null;

  // Direct user field match
  if (resource[userField]) {
    const resUserId = (resource[userField]._id || resource[userField]).toString();
    if (resUserId === reqUserId) return true;
  }

  // Student field match (via student ID or student.user)
  if (resource[studentField]) {
    const resStudent = resource[studentField];
    const resStudentUserId = (resStudent.user?._id || resStudent.user)?.toString();
    if (resStudentUserId && resStudentUserId === reqUserId) return true;

    const reqStudentId = user.student?._id?.toString() || user.student?.toString();
    const resStudentId = (resStudent._id || resStudent).toString();
    if (reqStudentId && resStudentId === reqStudentId) return true;
  }

  const err = new Error('Forbidden: You do not own this resource');
  err.status = 403;
  err.statusCode = 403;
  throw err;
}

module.exports = {
  getTenantScope,
  assertTenantAccess,
  assertResourceOwner,
};
