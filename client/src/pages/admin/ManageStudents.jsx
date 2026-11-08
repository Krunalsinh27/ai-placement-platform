import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import Table from '../../components/common/Table';
import Pagination from '../../components/common/Pagination';
import Modal from '../../components/common/Modal';
import { openResumeInNewTab } from '../../utils/resumeViewer';
import {
  Users,
  Search,
  ExternalLink,
  Trash2,
  Eye,
  Filter,
  Phone,
  Mail,
  Award,
} from 'lucide-react';
import toast from 'react-hot-toast';

const BRANCH_LIST = ['ALL', 'CSE', 'IT', 'ECE', 'EE', 'ME', 'CE', 'AI & DS', 'Chemical'];

const ManageStudents = () => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('ALL');
  const [batchYearFilter, setBatchYearFilter] = useState('');

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalStudents, setTotalStudents] = useState(0);
  const limit = 10;

  // Modals
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit,
      };
      if (search.trim()) params.search = search.trim();
      if (branchFilter !== 'ALL') params.branch = branchFilter;
      if (batchYearFilter) params.batchYear = batchYearFilter;

      const res = await api.get('/students', { params });
      if (res.data.success) {
        setStudents(res.data.students || []);
        setTotalPages(res.data.totalPages || 1);
        setTotalStudents(res.data.total || 0);
      }
    } catch (err) {
      console.error('Failed to load students:', err);
      toast.error('Unable to fetch students');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, [page, branchFilter, batchYearFilter]);

  // Handle Search submit
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchStudents();
  };

  const handleDelete = async () => {
    if (!selectedStudent) return;
    setIsDeleting(true);
    try {
      const res = await api.delete(`/students/${selectedStudent._id}`);
      if (res.data.success) {
        toast.success('Student and linked user account deleted successfully');
        setDeleteModalOpen(false);
        fetchStudents();
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to delete student';
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  const serverOrigin = (
    import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
  ).replace('/api', '');

  const columns = [
    {
      header: 'Student Name',
      accessor: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center shrink-0">
            {row.user?.name?.charAt(0).toUpperCase() || 'S'}
          </div>
          <div>
            <span className="font-bold text-slate-900 block">{row.user?.name}</span>
            <span className="text-[11px] text-slate-400">{row.user?.email}</span>
          </div>
        </div>
      ),
    },
    {
      header: 'Enrollment No',
      accessor: (row) => (
        <span className="font-mono font-semibold text-slate-700 uppercase">
          {row.enrollmentNo}
        </span>
      ),
    },
    {
      header: 'Branch & Year',
      accessor: (row) => (
        <div className="text-slate-700">
          <span className="font-bold">{row.branch}</span> • Batch {row.batchYear}
        </div>
      ),
    },
    {
      header: 'CGPA / Backlogs',
      accessor: (row) => (
        <div className="text-slate-700">
          <span className="font-semibold text-indigo-600">{row.cgpa} CGPA</span> •{' '}
          <span
            className={
              row.backlogs > 0 ? 'text-rose-600 font-bold' : 'text-slate-500'
            }
          >
            {row.backlogs} Backlogs
          </span>
        </div>
      ),
    },
    {
      header: 'Resume',
      accessor: (row) => {
        if (!row.resumeUrl) {
          return <span className="text-slate-400 text-[11px]">No Resume</span>;
        }

        return (
          <button
            type="button"
            onClick={() => openResumeInNewTab(row._id, `${row.user?.name || 'Student'}'s Resume`)}
            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold text-xs cursor-pointer"
          >
            <span>PDF</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        );
      },
    },
    {
      header: 'Actions',
      align: 'right',
      accessor: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => {
              setSelectedStudent(row);
              setViewModalOpen(true);
            }}
            className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 transition-colors"
            title="View Details"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setSelectedStudent(row);
              setDeleteModalOpen(true);
            }}
            className="p-1.5 rounded-lg text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition-colors"
            title="Delete Student"
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
            Registered Students
          </h1>
          <p className="text-sm text-slate-500">
            Search, filter by branch & batch, and manage registered student profiles.
          </p>
        </div>

        {/* Search & Filters */}
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-2">
          {/* Branch filter */}
          <select
            value={branchFilter}
            onChange={(e) => {
              setBranchFilter(e.target.value);
              setPage(1);
            }}
            className="text-xs py-2 pl-3 pr-8 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            {BRANCH_LIST.map((b) => (
              <option key={b} value={b}>
                {b === 'ALL' ? 'All Branches' : b}
              </option>
            ))}
          </select>

          {/* Batch Year input */}
          <input
            type="number"
            value={batchYearFilter}
            onChange={(e) => {
              setBatchYearFilter(e.target.value);
              setPage(1);
            }}
            placeholder="Year..."
            className="w-24 px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
          />

          {/* Search box */}
          <div className="relative w-44 sm:w-56">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or Enrollment..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
            />
          </div>

          <button
            type="submit"
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            Filter
          </button>
        </form>
      </div>

      {/* Students Table with integrated Pagination */}
      <div className="space-y-0">
        <Table
          columns={columns}
          data={students}
          loading={loading}
          emptyMessage="No students match the specified search or filter criteria."
        />
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalStudents}
          itemsPerPage={limit}
          onPageChange={(newPage) => setPage(newPage)}
        />
      </div>

      {/* View Student Details Modal */}
      <Modal
        isOpen={viewModalOpen}
        onClose={() => setViewModalOpen(false)}
        title="Student Profile Details"
        maxWidth="max-w-md"
      >
        {selectedStudent && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 font-extrabold text-base flex items-center justify-center">
                {selectedStudent.user?.name?.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  {selectedStudent.user?.name}
                </h3>
                <p className="text-slate-500">{selectedStudent.user?.email}</p>
                <span className="font-mono text-indigo-600 font-bold">
                  {selectedStudent.enrollmentNo}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl">
              <div>
                <span className="text-slate-400 block">Branch</span>
                <span className="font-bold text-slate-800">{selectedStudent.branch}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Batch Year</span>
                <span className="font-bold text-slate-800">{selectedStudent.batchYear}</span>
              </div>
              <div>
                <span className="text-slate-400 block">CGPA</span>
                <span className="font-bold text-emerald-600">{selectedStudent.cgpa} / 10</span>
              </div>
              <div>
                <span className="text-slate-400 block">Active Backlogs</span>
                <span className="font-bold text-slate-800">{selectedStudent.backlogs}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Phone</span>
                <span className="font-medium text-slate-800">{selectedStudent.phone || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Resume</span>
                {selectedStudent.resumeUrl ? (
                  <button
                    type="button"
                    onClick={() =>
                      openResumeInNewTab(
                        selectedStudent._id,
                        `${selectedStudent.user?.name || 'Student'}'s Resume`
                      )
                    }
                    className="text-indigo-600 hover:underline font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>View Resume</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                ) : (
                  <span className="text-slate-400">Not Uploaded</span>
                )}
              </div>
            </div>

            <div>
              <span className="text-slate-500 font-semibold block mb-1">
                Technical Skills
              </span>
              <div className="flex flex-wrap gap-1">
                {selectedStudent.skills?.length > 0 ? (
                  selectedStudent.skills.map((s, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-medium"
                    >
                      {s}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-400">No skills listed</span>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setViewModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Student Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Confirm Delete Student"
        maxWidth="max-w-sm"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600">
            Are you sure you want to permanently delete{' '}
            <strong className="text-slate-900">{selectedStudent?.user?.name}</strong> (
            {selectedStudent?.enrollmentNo})? This will delete their student profile, account credentials, and resume.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDeleteModalOpen(false)}
              className="px-4 py-2 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="px-4 py-2 rounded-xl font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors disabled:opacity-60 cursor-pointer"
            >
              {isDeleting ? 'Deleting...' : 'Delete Student'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ManageStudents;

