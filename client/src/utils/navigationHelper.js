/**
 * Determines whether the recruiter "Drive Pipeline" sidebar item is active.
 * Active for both /recruiter/pipeline and /recruiter/drives/:id/pipeline.
 *
 * @param {string} pathname
 * @returns {boolean}
 */
export function isRecruiterPipelineActive(pathname) {
  if (!pathname) return false;
  return (
    pathname === '/recruiter/pipeline' ||
    pathname.startsWith('/recruiter/pipeline') ||
    (pathname.startsWith('/recruiter/drives/') && pathname.includes('/pipeline'))
  );
}

/**
 * Determines whether the Admin / TPO "Drives" sidebar item is active.
 * Active for both /admin/drives and /admin/drives/:id/progress.
 *
 * @param {string} pathname
 * @returns {boolean}
 */
export function isAdminDrivesActive(pathname) {
  if (!pathname) return false;
  return pathname === '/admin/drives' || pathname.startsWith('/admin/drives');
}

/**
 * Determines whether the Student "My Applications" sidebar item is active.
 * Active for /student/applications as well as interview and test detail views.
 *
 * @param {string} pathname
 * @returns {boolean}
 */
export function isStudentApplicationsActive(pathname) {
  if (!pathname) return false;
  return (
    pathname === '/student/applications' ||
    pathname.startsWith('/student/applications') ||
    pathname.startsWith('/student/interview') ||
    pathname.startsWith('/student/test')
  );
}

