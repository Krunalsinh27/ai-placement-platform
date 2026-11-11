import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import Table from '../../components/common/Table';
import Pagination from '../../components/common/Pagination';
import {
  Award,
  Building2,
  Calendar,
  DollarSign,
  Filter,
  CheckCircle2,
  Sparkles,
  Download,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';

const BRANCH_OPTIONS = ['ALL', 'CSE', 'IT', 'ECE', 'EE', 'ME', 'CE', 'AI & DS', 'Chemical'];

const ManagePlacements = () => {
  const [placements, setPlacements] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [branchFilter, setBranchFilter] = useState('ALL');
  const [yearFilter, setYearFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('ALL');

  // Export Loading States
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPlacements, setTotalPlacements] = useState(0);
  const limit = 15;

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const params = {};
      if (branchFilter !== 'ALL') params.branch = branchFilter;
      if (yearFilter) params.year = yearFilter;
      if (companyFilter !== 'ALL') params.company = companyFilter;

      const res = await api.get('/placements/export/excel', {
        params,
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `placement_records_${Date.now()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Excel spreadsheet downloaded successfully!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to export Excel file');
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const params = {};
      if (branchFilter !== 'ALL') params.branch = branchFilter;
      if (yearFilter) params.year = yearFilter;

      const res = await api.get('/stats/export/pdf', {
        params,
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(
        new Blob([res.data], { type: 'application/pdf' })
      );
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `placement_summary_report_${Date.now()}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('PDF report downloaded successfully!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to export PDF report');
    } finally {
      setExportingPdf(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit,
      };
      if (branchFilter !== 'ALL') params.branch = branchFilter;
      if (yearFilter) params.year = yearFilter;
      if (companyFilter !== 'ALL') params.company = companyFilter;

      const [placeRes, compRes] = await Promise.all([
        api.get('/placements', { params }),
        api.get('/companies'),
      ]);

      if (placeRes.data.success) {
        setPlacements(placeRes.data.placements || []);
        setTotalPlacements(placeRes.data.total || placeRes.data.count || 0);
      }
      if (compRes.data.success) {
        setCompanies(compRes.data.companies || []);
      }
    } catch (err) {
      console.error('Failed to load placement records:', err);
      toast.error('Unable to fetch placement records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, branchFilter, yearFilter, companyFilter]);

  // Compute metrics for current records
  const packages = placements
    .map((p) => p.packageLpa)
    .filter((pkg) => typeof pkg === 'number' && !isNaN(pkg));
  const highestPackage = packages.length > 0 ? Math.max(...packages) : 0;
  const avgPackage =
    packages.length > 0
      ? (packages.reduce((a, b) => a + b, 0) / packages.length).toFixed(2)
      : 0;

  const columns = [
    {
      header: 'Placed Student',
      accessor: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0">
            {row.student?.user?.name?.charAt(0).toUpperCase() || 'S'}
          </div>
          <div>
            <span className="font-bold text-slate-900 block">
              {row.student?.user?.name}
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              {row.student?.enrollmentNo}
            </span>
          </div>
        </div>
      ),
    },
    {
      header: 'Branch & Batch',
      accessor: (row) => (
        <div className="text-slate-700">
          <span className="font-bold">{row.student?.branch}</span> • Batch {row.student?.batchYear}
        </div>
      ),
    },
    {
      header: 'Company & Role',
      accessor: (row) => (
        <div>
          <span className="font-bold text-slate-900 block">
            {row.company?.name || 'Company'}
          </span>
          <span className="text-[11px] text-slate-500 font-medium">
            {row.drive?.role || 'Designation'}
          </span>
        </div>
      ),
    },
    {
      header: 'Offered Package',
      accessor: (row) => (
        <div className="inline-flex items-baseline gap-1 text-emerald-600 font-extrabold text-sm">
          <span>{row.packageLpa != null && !isNaN(row.packageLpa) ? `${row.packageLpa} LPA` : '—'}</span>
          {row.packageLpa != null && !isNaN(row.packageLpa) && (
            <span className="text-[10px] text-slate-400 font-normal">CTC</span>
          )}
        </div>
      ),
    },
    {
      header: 'Offer Date',
      align: 'right',
      accessor: (row) => (
        <span className="text-slate-500 font-medium">
          {new Date(row.offerDate).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Official Placement Records
          </h1>
          <p className="text-sm text-slate-500">
            Verified campus job offers, salary distributions, and recruiter confirmations.
          </p>
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Branch Filter */}
          <select
            value={branchFilter}
            onChange={(e) => {
              setBranchFilter(e.target.value);
              setPage(1);
            }}
            className="text-xs py-2 pl-3 pr-8 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            {BRANCH_OPTIONS.map((b) => (
              <option key={b} value={b}>
                {b === 'ALL' ? 'All Branches' : b}
              </option>
            ))}
          </select>

          {/* Company Filter */}
          <select
            value={companyFilter}
            onChange={(e) => {
              setCompanyFilter(e.target.value);
              setPage(1);
            }}
            className="text-xs py-2 pl-3 pr-8 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Companies</option>
            {companies.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Batch Year */}
          <input
            type="number"
            value={yearFilter}
            onChange={(e) => {
              setYearFilter(e.target.value);
              setPage(1);
            }}
            placeholder="Batch Year..."
            className="w-28 px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />

          {/* Export Excel Button */}
          <button
            onClick={handleExportExcel}
            disabled={exportingExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors disabled:opacity-60 cursor-pointer"
            title="Download Excel Spreadsheets"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{exportingExcel ? 'Exporting...' : 'Export Excel'}</span>
          </button>

          {/* Export PDF Button */}
          <button
            onClick={handleExportPdf}
            disabled={exportingPdf}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors disabled:opacity-60 cursor-pointer"
            title="Download PDF Summary Report"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{exportingPdf ? 'Exporting...' : 'Export PDF'}</span>
          </button>
        </div>
      </div>

      {/* Quick Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase">
              Total Offers
            </span>
            <span className="text-xl font-extrabold text-slate-900 block">
              {totalPlacements}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase">
              Highest Package
            </span>
            <span className="text-xl font-extrabold text-slate-900 block">
              {highestPackage} LPA
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase">
              Average Package
            </span>
            <span className="text-xl font-extrabold text-slate-900 block">
              {avgPackage} LPA
            </span>
          </div>
        </div>
      </div>

      {/* Placements Table */}
      <div className="space-y-0">
        <Table
          columns={columns}
          data={placements}
          loading={loading}
          emptyMessage="No placement records found matching the current filters."
        />
        <Pagination
          currentPage={page}
          totalPages={Math.ceil(totalPlacements / limit) || 1}
          totalItems={totalPlacements}
          itemsPerPage={limit}
          onPageChange={(p) => setPage(p)}
        />
      </div>
    </div>
  );
};

export default ManagePlacements;

