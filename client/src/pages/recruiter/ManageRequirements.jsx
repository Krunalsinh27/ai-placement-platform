import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import Modal from '../../components/common/Modal';
import {
  Briefcase,
  Plus,
  Search,
  UploadCloud,
  Edit3,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  MapPin,
  GraduationCap,
  Sparkles,
  Layers,
  ArrowRight,
  Filter,
  Users,
  Check,
  Send,
} from 'lucide-react';
import toast from 'react-hot-toast';

const ALL_BRANCHES = ['CSE', 'IT', 'ECE', 'EE', 'ME', 'CE', 'AI & DS', 'Chemical'];

const ManageRequirements = () => {
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    packageLpa: '',
    openings: '5',
    skills: '',
    minCgpa: '7.0',
    maxBacklogs: '0',
    allowedBranches: ['CSE', 'IT', 'ECE'],
    batchYear: new Date().getFullYear() + 1,
    selectionRounds: 'Online Assessment, Technical Interview, HR Interview',
    location: 'Bengaluru / Hyderabad',
    status: 'draft',
  });

  const fetchRequirements = async () => {
    setLoading(true);
    try {
      const res = await api.get('/job-requirements');
      if (res.data.success) {
        setRequirements(res.data.requirements || []);
      }
    } catch (err) {
      console.error('Failed to load job requirements:', err);
      toast.error('Failed to fetch job requirements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequirements();
  }, []);

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({
      title: '',
      description: '',
      packageLpa: '',
      openings: '5',
      skills: '',
      minCgpa: '7.0',
      maxBacklogs: '0',
      allowedBranches: ['CSE', 'IT', 'ECE'],
      batchYear: new Date().getFullYear() + 1,
      selectionRounds: 'Online Assessment, Technical Interview, HR Interview',
      location: 'Bengaluru / Hyderabad',
      status: 'draft',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (req) => {
    setEditingId(req._id);
    setFormData({
      title: req.title || '',
      description: req.description || '',
      packageLpa: req.packageLpa || '',
      openings: req.openings || '1',
      skills: Array.isArray(req.skills) ? req.skills.join(', ') : '',
      minCgpa: req.minCgpa !== undefined ? req.minCgpa : '0',
      maxBacklogs: req.maxBacklogs !== undefined ? req.maxBacklogs : '0',
      allowedBranches: req.allowedBranches || ['CSE', 'IT'],
      batchYear: req.batchYear || new Date().getFullYear(),
      selectionRounds: Array.isArray(req.selectionRounds)
        ? req.selectionRounds.join(', ')
        : 'Aptitude, Technical, HR',
      location: req.location || 'Pan India',
      status: req.status || 'draft',
    });
    setIsModalOpen(true);
  };

  const handleBranchToggle = (branch) => {
    setFormData((prev) => {
      const current = prev.allowedBranches || [];
      if (current.includes(branch)) {
        if (current.length === 1) {
          toast.error('At least one branch must remain selected');
          return prev;
        }
        return { ...prev, allowedBranches: current.filter((b) => b !== branch) };
      } else {
        return { ...prev, allowedBranches: [...current, branch] };
      }
    });
  };

  const handleSelectAllBranches = () => {
    setFormData((prev) => ({
      ...prev,
      allowedBranches: [...ALL_BRANCHES],
    }));
  };

  const handlePublish = async (id) => {
    try {
      const res = await api.patch(`/job-requirements/${id}/publish`);
      if (res.data.success) {
        toast.success('Job Requirement published successfully!');
        setRequirements((prev) =>
          prev.map((r) => (r._id === id ? { ...r, status: 'published' } : r))
        );
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to publish requirement');
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      const res = await api.put(`/job-requirements/${id}`, { status: newStatus });
      if (res.data.success) {
        toast.success(`Status updated to ${newStatus}`);
        setRequirements((prev) =>
          prev.map((r) => (r._id === id ? { ...r, status: newStatus } : r))
        );
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status');
    }
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Are you sure you want to delete "${title}"?`)) return;

    try {
      const res = await api.delete(`/job-requirements/${id}`);
      if (res.data.success) {
        toast.success('Job Requirement removed');
        setRequirements((prev) => prev.filter((r) => r._id !== id));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete requirement');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast.error('Job title is required');
      return;
    }
    if (!formData.packageLpa) {
      toast.error('Package (LPA) is required');
      return;
    }
    if (!formData.allowedBranches || formData.allowedBranches.length === 0) {
      toast.error('Please select at least one eligible branch');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        packageLpa: Number(formData.packageLpa),
        openings: Number(formData.openings) || 1,
        skills: formData.skills
          ? formData.skills.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        minCgpa: Number(formData.minCgpa) || 0,
        maxBacklogs: Number(formData.maxBacklogs) || 0,
        allowedBranches: formData.allowedBranches,
        batchYear: Number(formData.batchYear),
        selectionRounds: formData.selectionRounds
          ? formData.selectionRounds.split(',').map((r) => r.trim()).filter(Boolean)
          : ['Aptitude', 'Technical', 'HR'],
        location: formData.location.trim(),
        status: formData.status,
      };

      if (editingId) {
        const res = await api.put(`/job-requirements/${editingId}`, payload);
        if (res.data.success) {
          toast.success('Job Requirement updated!');
          setRequirements((prev) =>
            prev.map((r) => (r._id === editingId ? res.data.requirement : r))
          );
        }
      } else {
        const res = await api.post('/job-requirements', payload);
        if (res.data.success) {
          toast.success('Job Requirement created!');
          setRequirements((prev) => [res.data.requirement, ...prev]);
        }
      }
      setIsModalOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick fill sample data in modal
  const handleQuickFill = () => {
    const randomBatch = 2025 + Math.floor(Math.random() * 2);
    setFormData({
      title: 'Senior Associate - Full Stack & Cloud Developer',
      description:
        'Architect, optimize, and maintain responsive distributed web applications and microservices on cloud infrastructure.',
      packageLpa: '14.5',
      openings: '10',
      skills: 'React, Node.js, TypeScript, PostgreSQL, Docker, AWS',
      minCgpa: '7.2',
      maxBacklogs: '0',
      allowedBranches: ['CSE', 'IT', 'ECE'],
      batchYear: randomBatch,
      selectionRounds:
        'Online Coding Test, System Architecture Round, Technical Interview, HR Round',
      location: 'Bengaluru / Pune / Hybrid',
      status: 'draft',
    });
    toast.success('Loaded sample requirement data');
  };

  // Filtered requirements
  const filteredRequirements = requirements.filter((req) => {
    const matchesStatus =
      statusFilter === 'all' ? true : req.status === statusFilter;
    const term = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !term ||
      req.title.toLowerCase().includes(term) ||
      (req.location && req.location.toLowerCase().includes(term)) ||
      (req.skills && req.skills.some((s) => s.toLowerCase().includes(term)));
    return matchesStatus && matchesSearch;
  });

  const publishedCount = requirements.filter((r) => r.status === 'published').length;
  const draftCount = requirements.filter((r) => r.status === 'draft').length;
  const closedCount = requirements.filter((r) => r.status === 'closed').length;
  const totalOpenings = requirements.reduce(
    (acc, curr) => acc + (Number(curr.openings) || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Briefcase className="w-6 h-6 text-sky-600" />
            <span>Job Requirements</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Define corporate job openings, package criteria, and campus eligibility for your company.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shadow-md shadow-sky-600/20 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Post New Requirement</span>
        </button>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
            Total Requirements
          </span>
          <span className="text-2xl sm:text-3xl font-black text-slate-900">
            {requirements.length}
          </span>
          <span className="text-[11px] text-slate-400 block mt-1">Across all hiring drives</span>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
            Published Active
          </span>
          <span className="text-2xl sm:text-3xl font-black text-emerald-600">
            {publishedCount}
          </span>
          <span className="text-[11px] text-emerald-600/80 block mt-1">Visible to campus cells</span>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
            Drafts Pending
          </span>
          <span className="text-2xl sm:text-3xl font-black text-amber-500">
            {draftCount}
          </span>
          <span className="text-[11px] text-amber-600/80 block mt-1">Ready to publish</span>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
            Total Positions
          </span>
          <span className="text-2xl sm:text-3xl font-black text-indigo-600">
            {totalOpenings}
          </span>
          <span className="text-[11px] text-slate-400 block mt-1">Candidate openings</span>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="Search by job title, location, or skill..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-sky-500 focus:outline-none"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: 'All', count: requirements.length },
            { id: 'published', label: 'Published', count: publishedCount },
            { id: 'draft', label: 'Drafts', count: draftCount },
            { id: 'closed', label: 'Closed', count: closedCount },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  statusFilter === tab.id
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Requirements List Cards */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 bg-slate-200 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filteredRequirements.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
          <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-700">No Job Requirements Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            {searchQuery || statusFilter !== 'all'
              ? 'No requirements matched your current filters. Try resetting the search or filter.'
              : 'Create your first hiring requirement to specify roles, packages, and eligibility criteria.'}
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 text-white text-xs font-bold hover:bg-sky-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Post Requirement</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRequirements.map((req) => (
            <div
              key={req._id}
              className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md transition-all p-5 sm:p-6 space-y-4"
            >
              {/* Card Top Row: Title, Status Badge, & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base sm:text-lg font-bold text-slate-900">
                      {req.title}
                    </h3>
                    {/* Status Badge */}
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        req.status === 'published'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : req.status === 'draft'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {req.status === 'published' ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Published</span>
                        </>
                      ) : req.status === 'draft' ? (
                        <>
                          <Clock className="w-3 h-3 text-amber-600" />
                          <span>Draft</span>
                        </>
                      ) : (
                        <span>Closed</span>
                      )}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed max-w-3xl line-clamp-2">
                    {req.description}
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 self-start shrink-0">
                  {/* Publish Button (prominent if draft) */}
                  {req.status === 'draft' && (
                    <button
                      type="button"
                      onClick={() => handlePublish(req._id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                      title="Publish to college campus cells"
                    >
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>Publish</span>
                    </button>
                  )}

                  {/* Send to Colleges Action */}
                  {req.status === 'published' && (
                    <Link
                      to="/recruiter/drive-requests"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shadow-xs transition-colors"
                      title="Propose Drive to Colleges"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send to Colleges</span>
                    </Link>
                  )}

                  {/* Toggle close / reopen */}
                  {req.status === 'published' && (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(req._id, 'closed')}
                      className="px-2.5 py-1.5 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-medium border border-slate-200 transition-colors"
                      title="Close Requirement"
                    >
                      Close
                    </button>
                  )}

                  {req.status === 'closed' && (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(req._id, 'draft')}
                      className="px-2.5 py-1.5 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-medium border border-slate-200 transition-colors"
                      title="Reopen as Draft"
                    >
                      Reopen
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => openEditModal(req)}
                    className="p-1.5 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 transition-colors"
                    title="Edit Requirement"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(req._id, req.title)}
                    className="p-1.5 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition-colors"
                    title="Delete Requirement"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Specs Pills Row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2 border-t border-slate-100">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">
                    Package (CTC)
                  </span>
                  <span className="text-xs font-black text-indigo-700 mt-0.5 block">
                    {req.packageLpa} LPA
                  </span>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">
                    Openings
                  </span>
                  <span className="text-xs font-bold text-slate-800 mt-0.5 block">
                    {req.openings} Positions
                  </span>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">
                    Batch Year
                  </span>
                  <span className="text-xs font-bold text-slate-800 mt-0.5 block">
                    {req.batchYear} Batch
                  </span>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">
                    Location
                  </span>
                  <span className="text-xs font-semibold text-slate-800 mt-0.5 block truncate">
                    {req.location || 'Pan India'}
                  </span>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">
                    Min CGPA
                  </span>
                  <span className="text-xs font-bold text-slate-800 mt-0.5 block">
                    &ge; {req.minCgpa}
                  </span>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">
                    Max Backlogs
                  </span>
                  <span className="text-xs font-bold text-slate-800 mt-0.5 block">
                    {req.maxBacklogs} Allowed
                  </span>
                </div>
              </div>

              {/* Eligible Branches & Skills */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs">
                {/* Branches */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-slate-400 font-semibold text-[11px] mr-1">
                    Branches:
                  </span>
                  {req.allowedBranches?.map((branch) => (
                    <span
                      key={branch}
                      className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 text-[11px] font-semibold"
                    >
                      {branch}
                    </span>
                  ))}
                </div>

                {/* Skills tags */}
                {req.skills && req.skills.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-slate-400 font-semibold text-[11px] mr-1">
                      Skills:
                    </span>
                    {req.skills.map((skill) => (
                      <span
                        key={skill}
                        className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Selection Process Stepper */}
              {req.selectionRounds && req.selectionRounds.length > 0 && (
                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                    Selection Process:
                  </span>
                  {req.selectionRounds.map((round, idx) => (
                    <React.Fragment key={idx}>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-50 text-sky-800 text-[11px] font-medium border border-sky-100">
                        <span className="w-3.5 h-3.5 rounded-full bg-sky-200 text-sky-800 text-[9px] font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span>{round}</span>
                      </span>
                      {idx < req.selectionRounds.length - 1 && (
                        <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Job Requirement' : 'Post New Job Requirement'}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleQuickFill}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg border border-sky-200 transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              <span>Fill Sample Data</span>
            </button>
          </div>

          {/* Job Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Job Title / Designation *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Associate Software Engineer - Cloud Platforms"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="block w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
            />
          </div>

          {/* Package, Openings, Batch Year */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Package (CTC in LPA) *
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                required
                placeholder="e.g. 12.5"
                value={formData.packageLpa}
                onChange={(e) => setFormData({ ...formData, packageLpa: e.target.value })}
                className="block w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Target Openings *
              </label>
              <input
                type="number"
                min="1"
                required
                placeholder="5"
                value={formData.openings}
                onChange={(e) => setFormData({ ...formData, openings: e.target.value })}
                className="block w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Batch Graduation Year *
              </label>
              <input
                type="number"
                min="2000"
                max="2100"
                required
                placeholder="2026"
                value={formData.batchYear}
                onChange={(e) => setFormData({ ...formData, batchYear: e.target.value })}
                className="block w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Location & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Job Location
              </label>
              <input
                type="text"
                placeholder="e.g. Bengaluru / Hyderabad / Remote"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="block w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Initial Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="block w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none bg-white"
              >
                <option value="draft">Draft (Private, not yet broadcast)</option>
                <option value="published">Published (Visible to Campus Placement Cells)</option>
                <option value="closed">Closed (Hiring completed)</option>
              </select>
            </div>
          </div>

          {/* Eligibility: CGPA & Backlogs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Minimum CGPA Requirement (0 - 10)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="10"
                placeholder="e.g. 7.5"
                value={formData.minCgpa}
                onChange={(e) => setFormData({ ...formData, minCgpa: e.target.value })}
                className="block w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Maximum Active Backlogs Permitted
              </label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={formData.maxBacklogs}
                onChange={(e) => setFormData({ ...formData, maxBacklogs: e.target.value })}
                className="block w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Allowed Branches Multi-Select */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Eligible Engineering Branches *
              </label>
              <button
                type="button"
                onClick={handleSelectAllBranches}
                className="text-[11px] text-sky-600 hover:text-sky-700 font-semibold"
              >
                Select All
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ALL_BRANCHES.map((branch) => {
                const selected = formData.allowedBranches?.includes(branch);
                return (
                  <button
                    key={branch}
                    type="button"
                    onClick={() => handleBranchToggle(branch)}
                    className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      selected
                        ? 'border-sky-500 bg-sky-50 text-sky-800'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {selected && <Check className="w-3 h-3 text-sky-600" />}
                    <span>{branch}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Skills */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Required Technical Skills (comma separated)
            </label>
            <input
              type="text"
              placeholder="e.g. React, Node.js, Python, SQL, Docker, AWS"
              value={formData.skills}
              onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
              className="block w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
            />
          </div>

          {/* Selection Rounds */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Selection Rounds (comma separated order)
            </label>
            <input
              type="text"
              placeholder="e.g. Online Assessment, Technical Round 1, Technical Round 2, HR Round"
              value={formData.selectionRounds}
              onChange={(e) =>
                setFormData({ ...formData, selectionRounds: e.target.value })
              }
              className="block w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Role Description & Key Responsibilities *
            </label>
            <textarea
              rows="3"
              required
              placeholder="Describe candidate day-to-day work, engineering challenges, learning prospects..."
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="block w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
            />
          </div>

          {/* Submit Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-md shadow-sky-600/20 transition-all disabled:opacity-60 cursor-pointer"
            >
              {isSubmitting ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{editingId ? 'Save Changes' : 'Save Requirement'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ManageRequirements;

