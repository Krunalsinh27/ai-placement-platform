import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import Table from '../../components/common/Table';
import Modal from '../../components/common/Modal';
import Pagination from '../../components/common/Pagination';
import {
  Briefcase,
  Plus,
  Pencil,
  Trash2,
  Users,
  Search,
  Calendar,
  Building2,
  Clock,
  CheckCircle2,
  XCircle,
  Layers,
} from 'lucide-react';
import toast from 'react-hot-toast';

const ALL_BRANCHES = [
  'CSE',
  'IT',
  'ECE',
  'EE',
  'ME',
  'CE',
  'AI & DS',
  'Chemical',
];

const ManageDrives = () => {
  const [drives, setDrives] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const limit = 10;

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedDrive, setSelectedDrive] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form data
  const [formData, setFormData] = useState({
    company: '',
    role: '',
    packageLpa: '',
    location: '',
    minCgpa: '6.0',
    maxBacklogs: '0',
    allowedBranches: ['CSE', 'IT'],
    lastDateToApply: '',
    driveDate: '',
    status: 'open',
  });

  const navigate = useNavigate();

  const fetchDrivesAndCompanies = async () => {
    setLoading(true);
    try {
      const [drivesRes, companiesRes] = await Promise.all([
        api.get('/drives'),
        api.get('/companies'),
      ]);

      if (drivesRes.data.success) {
        setDrives(drivesRes.data.drives || []);
      }
      if (companiesRes.data.success) {
        setCompanies(companiesRes.data.companies || []);
      }
    } catch (err) {
      console.error('Failed to load drives:', err);
      toast.error('Unable to fetch placement drives');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivesAndCompanies();
  }, []);

  const handleOpenAddModal = () => {
    setSelectedDrive(null);
    setFormData({
      company: companies[0]?._id || '',
      role: '',
      packageLpa: '',
      location: '',
      minCgpa: '6.5',
      maxBacklogs: '0',
      allowedBranches: ['CSE', 'IT'],
      lastDateToApply: '',
      driveDate: '',
      status: 'open',
    });
    setModalOpen(true);
  };

  const handleOpenEditModal = (drive) => {
    setSelectedDrive(drive);
    setFormData({
      company: drive.company?._id || drive.company || '',
      role: drive.role || '',
      packageLpa: drive.packageLpa || '',
      location: drive.location || '',
      minCgpa: drive.minCgpa !== undefined ? drive.minCgpa : 6.5,
      maxBacklogs: drive.maxBacklogs !== undefined ? drive.maxBacklogs : 0,
      allowedBranches: drive.allowedBranches || ['CSE', 'IT'],
      lastDateToApply: drive.lastDateToApply
        ? new Date(drive.lastDateToApply).toISOString().slice(0, 16)
        : '',
      driveDate: drive.driveDate
        ? new Date(drive.driveDate).toISOString().slice(0, 16)
        : '',
      status: drive.status || 'open',
    });
    setModalOpen(true);
  };

  const handleToggleBranch = (branch) => {
    setFormData((prev) => {
      const branches = prev.allowedBranches.includes(branch)
        ? prev.allowedBranches.filter((b) => b !== branch)
        : [...prev.allowedBranches, branch];
      return { ...prev, allowedBranches: branches };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.company || !formData.role.trim() || !formData.packageLpa) {
      toast.error('Please fill all required drive details');
      return;
    }

    if (formData.allowedBranches.length === 0) {
      toast.error('Select at least one allowed branch');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        packageLpa: Number(formData.packageLpa),
        minCgpa: Number(formData.minCgpa),
        maxBacklogs: Number(formData.maxBacklogs),
      };

      if (selectedDrive) {
        const res = await api.put(`/drives/${selectedDrive._id}`, payload);
        if (res.data.success) {
          toast.success('Drive updated successfully');
          fetchDrivesAndCompanies();
          setModalOpen(false);
        }
      } else {
        const res = await api.post('/drives', payload);
        if (res.data.success) {
          toast.success('Drive created successfully');
          fetchDrivesAndCompanies();
          setModalOpen(false);
        }
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to save drive';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedDrive) return;
    setIsSubmitting(true);
    try {
      const res = await api.delete(`/drives/${selectedDrive._id}`);
      if (res.data.success) {
        toast.success('Drive deleted successfully');
        fetchDrivesAndCompanies();
        setDeleteModalOpen(false);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to delete drive';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredDrives = drives.filter((d) => {
    const term = search.toLowerCase();
    const compName = d.company?.name?.toLowerCase() || '';
    const role = d.role?.toLowerCase() || '';
    const matchesSearch = compName.includes(term) || role.includes(term);
    const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalDrives = filteredDrives.length;
  const totalPages = Math.ceil(totalDrives / limit) || 1;
  const paginatedDrives = filteredDrives.slice((page - 1) * limit, page * limit);

  const columns = [
    {
      header: 'Company & Role',
      accessor: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center shrink-0">
            {row.company?.name?.charAt(0) || 'C'}
          </div>
          <div>
            <span className="font-bold text-slate-900 block">{row.company?.name}</span>
            <span className="text-[11px] text-slate-500 font-medium">{row.role}</span>
          </div>
        </div>
      ),
    },
    {
      header: 'Package',
      accessor: (row) => (
        <span className="font-extrabold text-emerald-600">{row.packageLpa} LPA</span>
      ),
    },
    {
      header: 'Criteria (CGPA / Backlogs)',
      accessor: (row) => (
        <div className="text-slate-600 text-[11px]">
          <span>Min {row.minCgpa} CGPA</span> • <span>Max {row.maxBacklogs} Backlogs</span>
          <div className="text-slate-400 truncate max-w-[150px]">
            {row.allowedBranches?.join(', ')}
          </div>
        </div>
      ),
    },
    {
      header: 'Deadlines',
      accessor: (row) => (
        <div className="text-[11px] text-slate-600 space-y-0.5">
          <div className="flex items-center gap-1">
            <span className="text-slate-400">Apply by:</span>
            <strong>{new Date(row.lastDateToApply).toLocaleDateString()}</strong>
          </div>
          <div className="flex items-center gap-1 text-slate-500">
            <span>Drive:</span>
            <span>{new Date(row.driveDate).toLocaleDateString()}</span>
          </div>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: (row) => (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
            row.status === 'open'
              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
              : 'bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          {row.status === 'open' ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          ) : (
            <XCircle className="w-3 h-3 text-slate-400" />
          )}
          <span className="capitalize">{row.status}</span>
        </span>
      ),
    },
    {
      header: 'Actions',
      align: 'right',
      accessor: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <Link
            to={`/admin/drives/${row._id}/progress`}
            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 border border-emerald-200 transition-colors"
            title="Recruitment Pipeline & Progress"
          >
            <Layers className="w-3.5 h-3.5" />
          </Link>
          <Link
            to={`/admin/applications?driveId=${row._id}`}
            className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 border border-indigo-200 transition-colors"
            title="View Applicants"
          >
            <Users className="w-3.5 h-3.5" />
          </Link>
          <button
            onClick={() => handleOpenEditModal(row)}
            className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 transition-colors"
            title="Edit Drive"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setSelectedDrive(row);
              setDeleteModalOpen(true);
            }}
            className="p-1.5 rounded-lg text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition-colors"
            title="Delete Drive"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Placement Drives
          </h1>
          <p className="text-sm text-slate-500">
            Publish recruitment drives, specify eligibility thresholds, and track candidate applications.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs py-2 pl-3 pr-8 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>

          {/* Search */}
          <div className="relative w-full sm:w-56">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search drive or company..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
            />
          </div>

          {/* Add Drive Button */}
          <button
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Drive</span>
          </button>
        </div>
      </div>

      {/* Drives Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <Table
          columns={columns}
          data={paginatedDrives}
          loading={loading}
          emptyMessage="No drives found. Click 'Create Drive' to launch a new recruitment drive."
        />
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalDrives}
          itemsPerPage={limit}
          onPageChange={(newPage) => setPage(newPage)}
        />
      </div>

      {/* Create / Edit Drive Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={selectedDrive ? 'Edit Placement Drive' : 'Create New Placement Drive'}
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Company */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Recruiting Company *
              </label>
              <select
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                required
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">Select a company</option>
                {companies.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Role */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Job Role / Title *
              </label>
              <input
                type="text"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                placeholder="e.g. Software Engineer"
                required
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {/* Package */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Package (CTC in LPA) *
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={formData.packageLpa}
                onChange={(e) => setFormData({ ...formData, packageLpa: e.target.value })}
                placeholder="e.g. 14.5"
                required
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Job Location *
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="e.g. Bengaluru / Pune"
                required
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {/* Min CGPA */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Minimum CGPA Required *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="10"
                value={formData.minCgpa}
                onChange={(e) => setFormData({ ...formData, minCgpa: e.target.value })}
                required
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {/* Max Backlogs */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Max Allowed Backlogs *
              </label>
              <input
                type="number"
                min="0"
                value={formData.maxBacklogs}
                onChange={(e) => setFormData({ ...formData, maxBacklogs: e.target.value })}
                required
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {/* Last Date to Apply */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Last Date to Apply *
              </label>
              <input
                type="datetime-local"
                value={formData.lastDateToApply}
                onChange={(e) => setFormData({ ...formData, lastDateToApply: e.target.value })}
                required
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {/* Drive Date */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Drive Date *
              </label>
              <input
                type="datetime-local"
                value={formData.driveDate}
                onChange={(e) => setFormData({ ...formData, driveDate: e.target.value })}
                required
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Allowed Branches multi-select */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Allowed Branches *
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_BRANCHES.map((branch) => {
                const selected = formData.allowedBranches.includes(branch);
                return (
                  <button
                    type="button"
                    key={branch}
                    onClick={() => handleToggleBranch(branch)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      selected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {branch}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Drive Status
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="open">Open for applications</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {/* Footer buttons */}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-60 cursor-pointer"
            >
              {isSubmitting ? 'Saving...' : selectedDrive ? 'Update Drive' : 'Publish Drive'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Drive Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Confirm Delete Drive"
        maxWidth="max-w-sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Are you sure you want to delete this drive for{' '}
            <strong className="text-slate-900">{selectedDrive?.company?.name}</strong> (
            {selectedDrive?.role})? All candidate applications for this drive will also be deleted.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDeleteModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors disabled:opacity-60 cursor-pointer"
            >
              {isSubmitting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ManageDrives;

