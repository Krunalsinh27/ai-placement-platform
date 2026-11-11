import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { openResumeInNewTab, downloadResumePdf } from '../../utils/resumeViewer';
import {
  User,
  Mail,
  Phone,
  Hash,
  BookOpen,
  Calendar,
  Award,
  AlertCircle,
  FileText,
  Upload,
  Download,
  ExternalLink,
  CheckCircle2,
  Save,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';

const BRANCH_OPTIONS = [
  'CSE',
  'IT',
  'ECE',
  'EE',
  'ME',
  'CE',
  'AI & DS',
  'Chemical',
];

const StudentProfile = () => {
  const { user, student, updateStudent, updateUser } = useAuth();

  const [loading, setLoading] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    phone: student?.phone || '',
    branch: student?.branch || 'CSE',
    batchYear: student?.batchYear || new Date().getFullYear(),
    cgpa: student?.cgpa || '',
    backlogs: student?.backlogs !== undefined ? student.backlogs : 0,
    skills: student?.skills ? student.skills.join(', ') : '',
    sendReminderEmails: student?.sendReminderEmails !== undefined ? student.sendReminderEmails : true,
  });

  const [selectedFile, setSelectedFile] = useState(null);

  // Sync initial state if student context changes
  useEffect(() => {
    if (student) {
      setFormData({
        name: user?.name || '',
        phone: student.phone || '',
        branch: student.branch || 'CSE',
        batchYear: student.batchYear || new Date().getFullYear(),
        cgpa: student.cgpa || '',
        backlogs: student.backlogs !== undefined ? student.backlogs : 0,
        skills: student.skills ? student.skills.join(', ') : '',
        sendReminderEmails: student.sendReminderEmails !== undefined ? student.sendReminderEmails : true,
      });
    }
  }, [student, user]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        branch: formData.branch,
        batchYear: Number(formData.batchYear),
        cgpa: Number(formData.cgpa),
        backlogs: Number(formData.backlogs),
        skills: formData.skills
          ? formData.skills.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        sendReminderEmails: Boolean(formData.sendReminderEmails),
      };

      const res = await api.put('/students/me', payload);

      if (res.data.success) {
        updateStudent(res.data.student);
        if (formData.name !== user?.name) {
          updateUser({ ...user, name: formData.name.trim() });
        }
        toast.success('Profile updated successfully!');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to update profile';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Resume Upload Handler
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Only PDF documents (.pdf) are allowed!');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('File size exceeds the 2MB limit!');
      return;
    }

    setSelectedFile(file);
  };

  const handleUploadResume = async () => {
    if (!selectedFile) {
      toast.error('Please choose a PDF resume file first.');
      return;
    }

    setUploadingResume(true);
    const data = new FormData();
    data.append('resume', selectedFile);

    try {
      const res = await api.post('/students/resume', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data.success) {
        updateStudent({ ...student, resumeUrl: res.data.resumeUrl });
        setSelectedFile(null);
        toast.success('Resume uploaded successfully!');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Resume upload failed';
      toast.error(msg);
    } finally {
      setUploadingResume(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Student Profile & Resume
        </h1>
        <p className="text-sm text-slate-500">
          Manage your contact information, academic credentials, and recruitment resume.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Profile Avatar & Resume Card */}
        <div className="space-y-6">
          {/* Student Overview Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs text-center">
            <div className="w-20 h-20 rounded-full bg-indigo-100 text-indigo-700 font-extrabold text-2xl flex items-center justify-center mx-auto shadow-inner">
              {user?.name?.charAt(0).toUpperCase() || 'S'}
            </div>
            <h2 className="mt-3 text-base font-bold text-slate-900">{user?.name}</h2>
            <p className="text-xs text-slate-500">{user?.email}</p>
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-semibold">
              <Hash className="w-3.5 h-3.5" />
              <span>{student?.enrollmentNo || 'NO ENROLLMENT'}</span>
            </div>
          </div>

          {/* Resume Upload & Download Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <FileText className="w-4 h-4 text-indigo-600" />
              <span>Placement Resume</span>
            </div>

            {student?.resumeUrl ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 text-xs font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Resume Attached</span>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => openResumeInNewTab('me', 'My Resume')}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>View</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadResumePdf(
                        'me',
                        `${user?.name ? user.name.replace(/\s+/g, '_') + '_Resume.pdf' : 'Resume.pdf'}`
                      )
                    }
                    className="inline-flex items-center justify-center p-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs">
                No resume uploaded yet. Please upload a PDF to apply to campus drives.
              </div>
            )}

            {/* Upload form */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <label className="block text-xs font-semibold text-slate-700">
                Upload New Resume (PDF only, max 2MB)
              </label>
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileChange}
                className="block w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
              />

              {selectedFile && (
                <button
                  type="button"
                  onClick={handleUploadResume}
                  disabled={uploadingResume}
                  className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors shadow-sm disabled:opacity-60 cursor-pointer"
                >
                  {uploadingResume ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      <span>Confirm Upload</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Resume AI Link Card */}
          <div className="bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/40 rounded-2xl border border-indigo-100 p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 leading-tight">
                  Resume AI Insights
                </h3>
                <p className="text-[11px] text-slate-500">
                  Skills, categorized proficiencies & drive matching
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Explore your AI-parsed resume summary, categorized technical skills, and live matching scores against open placement drives.
            </p>

            <Link
              to="/student/resume-ai"
              className="inline-flex items-center justify-center gap-2 w-full py-2 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs hover:shadow cursor-pointer"
            >
              <span>Open Resume AI</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Right Column: Editable Profile Details */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                Academic & Contact Information
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="block w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                {/* Email (Readonly) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address (Account ID)
                  </label>
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="block w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                    className="block w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                {/* Branch */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Branch / Discipline
                  </label>
                  <select
                    name="branch"
                    value={formData.branch}
                    onChange={handleChange}
                    className="block w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    {BRANCH_OPTIONS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Batch Year */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Passing Batch Year
                  </label>
                  <input
                    type="number"
                    name="batchYear"
                    value={formData.batchYear}
                    onChange={handleChange}
                    required
                    className="block w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                {/* CGPA */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Current CGPA (0.00 - 10.00)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="10"
                    name="cgpa"
                    value={formData.cgpa}
                    onChange={handleChange}
                    required
                    className="block w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                {/* Backlogs */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Active Backlogs
                  </label>
                  <input
                    type="number"
                    min="0"
                    name="backlogs"
                    value={formData.backlogs}
                    onChange={handleChange}
                    required
                    className="block w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Skills */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Technical Skills (comma-separated)
                </label>
                <input
                  type="text"
                  name="skills"
                  value={formData.skills}
                  onChange={handleChange}
                  placeholder="React, Node.js, Python, MongoDB, SQL"
                  className="block w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Notification & Email Preferences */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-start gap-3 p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                  <input
                    type="checkbox"
                    id="sendReminderEmails"
                    name="sendReminderEmails"
                    checked={formData.sendReminderEmails}
                    onChange={handleChange}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <label htmlFor="sendReminderEmails" className="cursor-pointer select-none">
                    <span className="text-sm font-semibold text-slate-900 block">
                      Send me reminder emails
                    </span>
                    <span className="text-xs text-slate-500 block mt-0.5 leading-relaxed">
                      Receive 24-hour and 1-hour email reminders before your scheduled interview slots and evaluation rounds. (Offer letters and round results are always sent).
                    </span>
                  </label>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors shadow-md shadow-indigo-600/20 disabled:opacity-60 cursor-pointer"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Save Profile Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentProfile;

