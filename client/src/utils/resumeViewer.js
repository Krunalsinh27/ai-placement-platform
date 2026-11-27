import api from '../services/api';
import toast from 'react-hot-toast';

/**
 * Fetch a student's resume blob via protected API and open it in a new browser tab.
 * @param {string} studentId - Student profile ID or 'me'
 * @param {string} title - Optional title for error toasts
 */
export const openResumeInNewTab = async (studentId, title = 'Resume') => {
  if (!studentId) {
    toast.error('Student identifier is missing');
    return;
  }
  const toastId = toast.loading(`Loading ${title}...`);
  try {
    const res = await api.get(`/students/${studentId}/resume`, {
      responseType: 'blob',
    });
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const blobUrl = window.URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
    toast.dismiss(toastId);
    // Cleanup URL after 2 minutes
    setTimeout(() => {
      window.URL.revokeObjectURL(blobUrl);
    }, 120000);
  } catch (err) {
    toast.dismiss(toastId);
    if (err.response?.status === 403) {
      toast.error('You are not authorized to view this resume');
    } else if (err.response?.status === 404) {
      toast.error('Resume not found');
    } else {
      toast.error('Failed to load resume');
    }
  }
};

/**
 * Fetch a student's resume blob via protected API and trigger download.
 * @param {string} studentId - Student profile ID or 'me'
 * @param {string} filename - Filename to save as
 */
export const downloadResumePdf = async (studentId, filename = 'resume.pdf') => {
  if (!studentId) {
    toast.error('Student identifier is missing');
    return;
  }
  const toastId = toast.loading('Downloading resume...');
  try {
    const res = await api.get(`/students/${studentId}/resume`, {
      responseType: 'blob',
    });
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.dismiss(toastId);
    toast.success('Resume downloaded');
    setTimeout(() => {
      window.URL.revokeObjectURL(blobUrl);
    }, 60000);
  } catch (err) {
    toast.dismiss(toastId);
    if (err.response?.status === 403) {
      toast.error('You are not authorized to download this resume');
    } else {
      toast.error('Failed to download resume');
    }
  }
};

/**
 * Fetch an application's submitted resume snapshot PDF blob via protected API and open it in a new browser tab.
 * @param {string} applicationId - Application ID
 * @param {string} title - Optional title for error toasts
 */
export const openSnapshotResumeInNewTab = async (applicationId, title = 'Submitted Resume') => {
  if (!applicationId) {
    toast.error('Application identifier is missing');
    return;
  }
  const toastId = toast.loading(`Loading ${title}...`);
  try {
    const res = await api.get(`/applications/${applicationId}/resume-snapshot/pdf`, {
      responseType: 'blob',
    });
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const blobUrl = window.URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
    toast.dismiss(toastId);
    // Cleanup URL after 2 minutes
    setTimeout(() => {
      window.URL.revokeObjectURL(blobUrl);
    }, 120000);
  } catch (err) {
    toast.dismiss(toastId);
    if (err.response?.status === 403) {
      toast.error('You are not authorized to view this submitted resume snapshot');
    } else if (err.response?.status === 404) {
      toast.error('Submitted resume snapshot not found');
    } else {
      toast.error('Failed to load submitted resume snapshot');
    }
  }
};

/**
 * Fetch an application's submitted resume snapshot PDF blob via protected API and trigger download.
 * @param {string} applicationId - Application ID
 * @param {string} filename - Filename to save as
 */
export const downloadSnapshotResumePdf = async (applicationId, filename = 'submitted-resume.pdf') => {
  if (!applicationId) {
    toast.error('Application identifier is missing');
    return;
  }
  const toastId = toast.loading('Downloading submitted resume...');
  try {
    const res = await api.get(`/applications/${applicationId}/resume-snapshot/pdf`, {
      responseType: 'blob',
    });
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.dismiss(toastId);
    toast.success('Submitted resume downloaded');
    setTimeout(() => {
      window.URL.revokeObjectURL(blobUrl);
    }, 60000);
  } catch (err) {
    toast.dismiss(toastId);
    if (err.response?.status === 403) {
      toast.error('You are not authorized to download this submitted resume snapshot');
    } else {
      toast.error('Failed to download submitted resume snapshot');
    }
  }
};

