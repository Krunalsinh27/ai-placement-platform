import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import Table from '../../components/common/Table';
import {
  FileCheck2,
  Search,
  ExternalLink,
  Award,
  Users,
  Briefcase,
  CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_OPTIONS = [
  { value: 'applied', label: 'Applied' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'interview', label: 'Interview' },
  { value: 'selected', label: 'Selected' },
  { value: 'rejected', label: 'Rejected' },
];

const ManageApplications = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialDriveId = searchParams.get('driveId') || '';

  const [drives, setDrives] = useState([]);
  const [selectedDriveId, setSelectedDriveId] = useState(initialDriveId);
  const [applications, setApplications] = useState([]);
  const [loadingDrives, setLoadingDrives] = useState(true);
  const [loadingApps, setLoadingApps] = useState(false);
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState(null);

  // Fetch drives list
  useEffect(() => {
    const fetchDrives = async () => {
      setLoadingDrives(true);
      try {
        const res = await api.get('/drives');
        if (res.data.success) {
          const driveList = res.data.drives || [];
          setDrives(driveList);

          // If no drive selected yet, default to first drive or url param
          if (!selectedDriveId && driveList.length > 0) {
            setSelectedDriveId(driveList[0]._id);
            setSearchParams({ driveId: driveList[0]._id });
          }
        }
      } catch (err) {
        console.error('Failed to load drives:', err);
        toast.error('Unable to fetch placement drives');
      } finally {
        setLoadingDrives(false);
      }
    };

    fetchDrives();
  }, []);

  // Fetch applications whenever selected drive changes
  useEffect(() => {
    if (!selectedDriveId) return;

    const fetchApplications = async () => {
      setLoadingApps(true);
      try {
        const res = await api.get(`/applications/drive/${selectedDriveId}`);
        if (res.data.success) {
          setApplications(res.data.applications || []);
        }
      } catch (err) {
        console.error('Failed to load drive applicants:', err);
        toast.error('Unable to fetch drive applicants');
      } finally {
        setLoadingApps(false);
      }
    };

    fetchApplications();
  }, [selectedDriveId]);

  const handleDriveChange = (e) => {
    const driveId = e.target.value;
    setSelectedDriveId(driveId);
    setSearchParams({ driveId });
  };

  const handleStatusChange = async (applicationId, newStatus) => {
    setUpdatingId(applicationId);
    try {
      const res = await api.put(`/applications/${applicationId}/status`, {
        status: newStatus,
      });

      if (res.data.success) {
        if (newStatus === 'selected') {
          toast.success(
            `Status updated to 'Selected'. Placement offer record created automatically!`,
            { duration: 5000 }
          );
        } else {
          toast.success(`Status updated to '${newStatus}'`);
        }

        // Update local state
        setApplications((prev) =>
          prev.map((app) =>
            app._id === applicationId ? { ...app, status: newStatus } : app
          )
        );
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to update status';
      toast.error(msg);
    } finally {
      setUpdatingId(null);
    }
  };

  const currentDrive = drives.find((d) => d._id === selectedDriveId);

  const filteredApplications = applications.filter((app) => {
    const term = search.toLowerCase();
    const name = app.student?.user?.name?.toLowerCase() || '';
    const enrollment = app.student?.enrollmentNo?.toLowerCase() || '';
    const branch = app.student?.branch?.toLowerCase() || '';
    return (
      name.includes(term) || enrollment.includes(term) || branch.includes(term)
    );
  });

  const serverOrigin = (
    import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
  ).replace('/api', '');

  const columns = [
    {
      header: 'Applicant Name',
      accessor: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center shrink-0">
            {row.student?.user?.name?.charAt(0).toUpperCase() || 'S'}
          </div>
          <div>
            <span className="font-bold text-slate-900 block">
              {row.student?.user?.name}
            </span>
            <span className="text-[11px] text-slate-400">
              {row.student?.user?.email}
            </span>
          </div>
        </div>
      ),
    },
    {
      header: 'Enrollment No',
      accessor: (row) => (
        <span className="font-mono font-semibold text-slate-700 uppercase">
          {row.student?.enrollmentNo}
        </span>
      ),
    },
    {
      header: 'Branch & Year',
      accessor: (row) => (
        <div className="text-slate-600">
          <span className="font-bold">{row.student?.branch}</span> • Batch{' '}
          {row.student?.batchYear}
        </div>
      ),
    },
    {
      header: 'CGPA / Backlogs',
      accessor: (row) => (
        <div className="text-slate-700">
          <span className="font-semibold">{row.student?.cgpa} CGPA</span> •{' '}
          <span
            className={
              row.student?.backlogs > 0
                ? 'text-rose-600 font-bold'
                : 'text-slate-500'
            }
          >
            {row.student?.backlogs} Backlogs
          </span>
        </div>
      ),
    },
    {
      header: 'Resume',
      accessor: (row) => {
        if (!row.student?.resumeUrl) {
          return <span className="text-slate-400 text-[11px]">Not uploaded</span>;
        }

        const fullUrl = row.student.resumeUrl.startsWith('http')
          ? row.student.resumeUrl
          : `${serverOrigin}${row.student.resumeUrl}`;

        return (
          <a
            href={fullUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold text-xs"
          >
            <span>PDF</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        );
      },
    },
    {
      header: 'Status & Decision',
      align: 'right',
      accessor: (row) => (
        <div className="flex items-center justify-end gap-2">
          <select
            value={row.status}
            disabled={updatingId === row._id}
            onChange={(e) => handleStatusChange(row._id, e.target.value)}
            className={`text-xs font-bold py-1 px-2.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              row.status === 'selected'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                : row.status === 'rejected'
                ? 'bg-rose-50 text-rose-700 border-rose-300'
                : row.status === 'shortlisted' || row.status === 'interview'
                ? 'bg-amber-50 text-amber-700 border-amber-300'
                : 'bg-blue-50 text-blue-700 border-blue-300'
            }`}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
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
            Drive Applicants
          </h1>
          <p className="text-sm text-slate-500">
            Review registered candidates, inspect credentials, and manage recruitment decisions.
          </p>
        </div>

        {/* Drive Selector Dropdown */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600 shrink-0">
            Select Drive:
          </label>
          <select
            value={selectedDriveId}
            onChange={handleDriveChange}
            className="text-xs py-2 pl-3 pr-8 rounded-xl border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            {drives.map((d) => (
              <option key={d._id} value={d._id}>
                {d.company?.name} — {d.role} ({d.packageLpa} LPA)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Selected Drive Summary Card */}
      {currentDrive && (
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 font-extrabold flex items-center justify-center text-sm">
              {currentDrive.company?.name?.charAt(0) || 'C'}
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-900">
                {currentDrive.company?.name} • {currentDrive.role}
              </h2>
              <p className="text-xs text-slate-500">
                Package: <strong>{currentDrive.packageLpa} LPA</strong> • Min CGPA:{' '}
                {currentDrive.minCgpa} • Location: {currentDrive.location}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-xs text-slate-400 block font-medium">
                Total Applicants
              </span>
              <span className="text-base font-extrabold text-slate-800">
                {applications.length}
              </span>
            </div>

            {/* Search */}
            <div className="relative w-48 sm:w-56">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter candidate..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* Applicants Table */}
      <Table
        columns={columns}
        data={filteredApplications}
        loading={loadingApps}
        emptyMessage="No students have applied to this drive yet."
      />
    </div>
  );
};

export default ManageApplications;

