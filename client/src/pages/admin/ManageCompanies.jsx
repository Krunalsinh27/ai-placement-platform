import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import Table from '../../components/common/Table';
import Modal from '../../components/common/Modal';
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  Search,
  ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';

const ManageCompanies = () => {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    industry: '',
    website: '',
    description: '',
  });

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const res = await api.get('/companies');
      if (res.data.success) {
        setCompanies(res.data.companies || []);
      }
    } catch (err) {
      console.error('Failed to load companies:', err);
      toast.error('Unable to fetch companies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleOpenAddModal = () => {
    setSelectedCompany(null);
    setFormData({
      name: '',
      industry: '',
      website: '',
      description: '',
    });
    setModalOpen(true);
  };

  const handleOpenEditModal = (comp) => {
    setSelectedCompany(comp);
    setFormData({
      name: comp.name || '',
      industry: comp.industry || '',
      website: comp.website || '',
      description: comp.description || '',
    });
    setModalOpen(true);
  };

  const handleOpenDeleteModal = (comp) => {
    setSelectedCompany(comp);
    setDeleteModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.industry.trim()) {
      toast.error('Name and Industry are required');
      return;
    }

    setIsSubmitting(true);
    try {
      if (selectedCompany) {
        // Update
        const res = await api.put(`/companies/${selectedCompany._id}`, formData);
        if (res.data.success) {
          toast.success('Company updated successfully');
          fetchCompanies();
          setModalOpen(false);
        }
      } else {
        // Create
        const res = await api.post('/companies', formData);
        if (res.data.success) {
          toast.success('Company created successfully');
          fetchCompanies();
          setModalOpen(false);
        }
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Operation failed';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCompany) return;
    setIsSubmitting(true);
    try {
      const res = await api.delete(`/companies/${selectedCompany._id}`);
      if (res.data.success) {
        toast.success('Company deleted successfully');
        fetchCompanies();
        setDeleteModalOpen(false);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to delete company';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCompanies = companies.filter((c) => {
    const term = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(term) ||
      c.industry?.toLowerCase().includes(term)
    );
  });

  const columns = [
    {
      header: 'Company Name',
      accessor: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center shrink-0">
            {row.name?.charAt(0) || 'C'}
          </div>
          <div>
            <span className="font-bold text-slate-900 block">{row.name}</span>
            {row.website && (
              <a
                href={row.website}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-indigo-600 hover:underline inline-flex items-center gap-1"
              >
                <span>{row.website.replace(/^https?:\/\//, '')}</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
        </div>
      ),
    },
    {
      header: 'Industry',
      accessor: (row) => (
        <span className="font-semibold text-slate-700">{row.industry}</span>
      ),
    },
    {
      header: 'Description',
      accessor: (row) => (
        <p className="max-w-xs truncate text-slate-500">
          {row.description || '—'}
        </p>
      ),
    },
    {
      header: 'Actions',
      align: 'right',
      accessor: (row) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => handleOpenEditModal(row)}
            className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 transition-colors"
            title="Edit Company"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleOpenDeleteModal(row)}
            className="p-1.5 rounded-lg text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition-colors"
            title="Delete Company"
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
            Recruiting Companies
          </h1>
          <p className="text-sm text-slate-500">
            Manage partner companies, recruitment profiles, and drive affiliations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative w-full sm:w-60">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
            />
          </div>

          {/* Add Company Button */}
          <button
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Company</span>
          </button>
        </div>
      </div>

      {/* Companies Table */}
      <Table
        columns={columns}
        data={filteredCompanies}
        loading={loading}
        emptyMessage="No companies found. Click 'Add Company' to create one."
      />

      {/* Add / Edit Company Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={selectedCompany ? 'Edit Company' : 'Add New Company'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Company Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Google Inc"
              required
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Industry Domain *
            </label>
            <input
              type="text"
              value={formData.industry}
              onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
              placeholder="e.g. Information Technology / Cloud"
              required
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Official Website
            </label>
            <input
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              placeholder="https://careers.company.com"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Description / Overview
            </label>
            <textarea
              rows="3"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief details about the company..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-60 cursor-pointer"
            >
              {isSubmitting ? 'Saving...' : selectedCompany ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Confirm Delete Company"
        maxWidth="max-w-sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Are you sure you want to delete{' '}
            <strong className="text-slate-900">{selectedCompany?.name}</strong>? This action cannot be undone.
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

export default ManageCompanies;

