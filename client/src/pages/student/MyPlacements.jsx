import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Award, Building2, Calendar, DollarSign, CheckCircle, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';

const MyPlacements = () => {
  const [loading, setLoading] = useState(true);
  const [placements, setPlacements] = useState([]);

  useEffect(() => {
    const fetchPlacements = async () => {
      setLoading(true);
      try {
        const res = await api.get('/placements/my');
        if (res.data.success) {
          setPlacements(res.data.placements || []);
        }
      } catch (err) {
        console.error('Failed to fetch placements:', err);
        toast.error('Unable to fetch your placement records');
      } finally {
        setLoading(false);
      }
    };

    fetchPlacements();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          My Placement Offers
        </h1>
        <p className="text-sm text-slate-500">
          Official recruitment offers and confirmed placement packages.
        </p>
      </div>

      {placements.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
            <Award className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">No Confirmed Offers Yet</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Once a recruitment officer selects your application, your official placement confirmation and package breakdown will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {placements.map((placement) => (
            <div
              key={placement._id}
              className="relative overflow-hidden bg-white rounded-2xl border border-emerald-200 p-6 shadow-sm flex flex-col justify-between"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-bl-full -z-0" />

              <div className="relative z-10 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-800 font-extrabold text-lg flex items-center justify-center shadow-xs">
                      {placement.company?.name?.charAt(0) || 'C'}
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">
                        {placement.company?.name}
                      </h2>
                      <span className="text-xs text-slate-500">{placement.company?.industry}</span>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Selected</span>
                  </span>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Designation / Role:</span>
                    <span className="font-bold text-slate-800">{placement.drive?.role || 'Software Engineer'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Offered CTC Package:</span>
                    <span className="font-extrabold text-emerald-600 text-sm">
                      {placement.packageLpa != null && !isNaN(placement.packageLpa)
                        ? `${placement.packageLpa} LPA`
                        : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Offer Recorded Date:</span>
                    <span className="font-medium text-slate-700">
                      {new Date(placement.offerDate).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              {placement.company?.website && (
                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                  <a
                    href={placement.company.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    <span>Visit Company Portal</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyPlacements;

