import api from '../../../services/api';

/**
 * Resume Studio API client wrappers
 * Communicates with /api/resume-studio endpoints
 */

export const listResumes = async (params = {}) => {
  const response = await api.get('/resume-studio/resumes', { params });
  return response.data;
};

export const getResume = async (id) => {
  const response = await api.get(`/resume-studio/resumes/${id}`);
  return response.data;
};

export const createResume = async (data = {}) => {
  const response = await api.post('/resume-studio/resumes', data);
  return response.data;
};

export const updateResume = async (id, data = {}) => {
  const response = await api.patch(`/resume-studio/resumes/${id}`, data);
  return response.data;
};

export const archiveResume = async (id) => {
  const response = await api.delete(`/resume-studio/resumes/${id}`);
  return response.data;
};

export const unarchiveResume = async (id) => {
  const response = await api.post(`/resume-studio/resumes/${id}/unarchive`);
  return response.data;
};

export const trashResume = async (id) => {
  const response = await api.post(`/resume-studio/resumes/${id}/trash`);
  return response.data;
};

export const listTrashResumes = async (params = {}) => {
  const response = await api.get('/resume-studio/resumes/trash', { params });
  return response.data;
};

export const restoreTrashResume = async (id) => {
  const response = await api.post(`/resume-studio/resumes/${id}/restore-trash`);
  return response.data;
};

export const duplicateResume = async (id, data = {}) => {
  const response = await api.post(`/resume-studio/resumes/${id}/duplicate`, data);
  return response.data;
};

export const setPrimaryResume = async (id) => {
  const response = await api.post(`/resume-studio/resumes/${id}/primary`);
  return response.data;
};

export const listResumeVersions = async (id, params = {}) => {
  const response = await api.get(`/resume-studio/resumes/${id}/versions`, { params });
  return response.data;
};

export const createResumeVersion = async (id, data = {}) => {
  const response = await api.post(`/resume-studio/resumes/${id}/versions`, data);
  return response.data;
};

export const restoreResumeVersion = async (id, vid, data = {}) => {
  const response = await api.post(`/resume-studio/resumes/${id}/versions/${vid}/restore`, data);
  return response.data;
};

export const deleteResumeVersion = async (id, vid) => {
  const response = await api.delete(`/resume-studio/resumes/${id}/versions/${vid}`);
  return response.data;
};

export const fetchTemplates = async () => {
  const response = await api.get('/resume-studio/templates');
  return response.data;
};

export const exportResumePdf = async (id, title = 'Resume') => {
  const response = await api.post(
    `/resume-studio/resumes/${id}/export-pdf`,
    {},
    {
      responseType: 'blob',
    }
  );
  if (typeof window !== 'undefined' && window.URL) {
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    const filename = `${(title || 'Resume')
      .replace(/[^a-zA-Z0-9_\- ]/g, '')
      .trim()
      .replace(/\s+/g, '_')}.pdf`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }
};

/**
 * Loads resume data from selected source ('profile', 'upload', 'resume_ai_file', 'text')
 * Reuses existing /api/resume-builder/source endpoint with zero mixing
 */
export const loadResumeSource = async (payload) => {
  let headers = {};
  if (typeof FormData !== 'undefined' && payload instanceof FormData) {
    headers['Content-Type'] = 'multipart/form-data';
  }
  const response = await api.post('/resume-builder/source', payload, { headers });
  return response.data;
};

/**
 * Phase 11: Get TPO reviews for a resume
 */
export const getResumeReviews = async (id) => {
  const response = await api.get(`/resume-studio/resumes/${id}/reviews`);
  return response.data;
};

/**
 * Phase 11: TPO list student resumes
 */
export const listTpoResumes = async (params = {}) => {
  const response = await api.get('/resume-studio/tpo/resumes', { params });
  return response.data;
};

/**
 * Phase 11: TPO get student resume details and submissions
 */
export const getTpoResume = async (id) => {
  const response = await api.get(`/resume-studio/tpo/resumes/${id}`);
  return response.data;
};

/**
 * Phase 11: TPO post review on student resume
 */
export const createTpoReview = async (id, data = {}) => {
  const response = await api.post(`/resume-studio/tpo/resumes/${id}/reviews`, data);
  return response.data;
};

/**
 * Phase 7: AI Suggestions (summary, bullet, skills)
 */
export const suggestResume = async (id, data = {}) => {
  const response = await api.post(`/resume-studio/resumes/${id}/suggest`, data);
  return response.data;
};

/**
 * Phase 8: Tailor resume to target drive or custom JD
 */
export const tailorResume = async (id, data = {}) => {
  const response = await api.post(`/resume-studio/resumes/${id}/tailor`, data);
  return response.data;
};

/**
 * Phase 8: Apply accepted tailor proposals to create a new ResumeVersion
 */
export const applyTailorResume = async (id, data = {}) => {
  const response = await api.post(`/resume-studio/resumes/${id}/tailor/apply`, data);
  return response.data;
};

/**
 * Phase 9: Import resume draft from upload / resume_ai_file / text / profile
 */
export const importResumeDraft = async (payload) => {
  let headers = {};
  if (typeof FormData !== 'undefined' && payload instanceof FormData) {
    headers['Content-Type'] = 'multipart/form-data';
  }
  const response = await api.post('/resume-studio/resumes/import', payload, { headers });
  return response.data;
};

/**
 * Phase 9: Cover Letter API Methods
 */
export const generateCoverLetterApi = async (id, data = {}) => {
  const response = await api.post(`/resume-studio/resumes/${id}/cover-letter/generate`, data);
  return response.data;
};

export const saveCoverLetterApi = async (id, data = {}) => {
  const response = await api.put(`/resume-studio/resumes/${id}/cover-letter`, data);
  return response.data;
};

export const getCoverLetterApi = async (id, params = {}) => {
  const response = await api.get(`/resume-studio/resumes/${id}/cover-letter`, { params });
  return response.data;
};

export const exportCoverLetterPdfApi = async (id, data = {}, candidateName = 'Candidate') => {
  const response = await api.post(
    `/resume-studio/resumes/${id}/cover-letter/export-pdf`,
    data,
    {
      responseType: 'blob',
    }
  );
  if (typeof window !== 'undefined' && window.URL) {
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    const safeName = (candidateName || 'Candidate').replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_');
    link.setAttribute('download', `Cover_Letter_${safeName}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }
};






