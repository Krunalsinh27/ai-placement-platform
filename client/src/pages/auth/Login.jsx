import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { GraduationCap, Mail, Lock, ArrowRight, ShieldCheck, User, Building2, AlertCircle, Compass, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

let DevQuickCredentials = null;
if (import.meta.env.DEV) {
  DevQuickCredentials = ({ onFill }) => (
    <div className="mt-6 pt-5 border-t border-slate-100">
      <p className="text-center text-xs font-medium text-slate-500 mb-2">
        Quick Test Credentials:
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        <button
          type="button"
          onClick={() => onFill('superadmin@portal.com', 'Super@12345')}
          className="inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors"
          title="Superadmin"
        >
          <ShieldCheck className="w-3 h-3 text-rose-600" />
          <span>Superadmin</span>
        </button>
        <button
          type="button"
          onClick={() => onFill('aspirant@portal.com', 'Aspirant@123')}
          className="inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 transition-colors"
          title="Prospective Student"
        >
          <Compass className="w-3 h-3 text-teal-600" />
          <span>Aspirant</span>
        </button>
        <button
          type="button"
          onClick={() => onFill('admin@college.com', 'Admin@123')}
          className="inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors"
          title="NIT Delhi TPO"
        >
          <ShieldCheck className="w-3 h-3" />
          <span>NITD TPO</span>
        </button>
        <button
          type="button"
          onClick={() => onFill('tpo.pict@college.com', 'Admin@123')}
          className="inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
          title="PICT Pune TPO"
        >
          <ShieldCheck className="w-3 h-3" />
          <span>PICT TPO</span>
        </button>
        <button
          type="button"
          onClick={() => onFill('recruiter@google.com', 'Recruiter@123')}
          className="inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition-colors"
          title="Google Recruiter"
        >
          <Building2 className="w-3 h-3" />
          <span>Recruiter</span>
        </button>
        <button
          type="button"
          onClick={() => onFill('analyst@portal.com', 'Analyst@123')}
          className="inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
          title="Placement Analyst"
        >
          <ShieldCheck className="w-3 h-3" />
          <span>Analyst</span>
        </button>
        <button
          type="button"
          onClick={() => onFill('aarav.sharma1@college.com', 'Student@123')}
          className="inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
          title="Sample Student"
        >
          <User className="w-3 h-3" />
          <span>Student</span>
        </button>
      </div>
    </div>
  );
}

const Login = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();

  const [formData, setFormData] = useState({
    email: location.state?.verifiedEmail || '',
    password: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [unverifiedEmail, setUnverifiedEmail] = useState(null);
  const [unapprovedNotice, setUnapprovedNotice] = useState(null);
  const [sendingVerifyNow, setSendingVerifyNow] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
    if (unapprovedNotice) {
      setUnapprovedNotice(null);
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.email.trim()) {
      newErrors.email = 'Email address is required';
    } else if (!/^\S+@\S+\.\S+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setUnverifiedEmail(null);
    setUnapprovedNotice(null);
    try {
      const data = await login(formData.email.trim(), formData.password);
      toast.success(`Welcome back, ${data.user.name}!`);

      // Redirect based on role
      let redirectPath = location.state?.from?.pathname;
      if (!redirectPath) {
        if (data.user.role === 'superadmin') {
          redirectPath = '/superadmin/dashboard';
        } else if (data.user.role === 'aspirant') {
          redirectPath = '/aspirant/explore';
        } else if (['admin', 'tpo'].includes(data.user.role)) {
          redirectPath = '/admin/dashboard';
        } else if (data.user.role === 'recruiter') {
          redirectPath = '/recruiter/dashboard';
        } else if (data.user.role === 'analyst') {
          redirectPath = '/analyst/dashboard';
        } else {
          redirectPath = '/student/dashboard';
        }
      }
      navigate(redirectPath, { replace: true });
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed. Please check your credentials.';
      toast.error(msg);
      if (err.response?.data?.unverified) {
        setUnverifiedEmail(err.response.data.email || formData.email.trim());
      }
      if (err.response?.data?.unapproved) {
        setUnapprovedNotice({
          message: err.response.data.message,
          collegeName: err.response.data.collegeName,
          role: err.response.data.role,
          whatNext:
            err.response.data.whatNext ||
            (err.response.data.role === 'tpo'
              ? 'An existing TPO from your college will review and approve your account. Once approved, you can log in immediately.'
              : err.response.data.role === 'student'
              ? 'Your college Training & Placement Office will verify your student credentials and activate your placement portal account.'
              : 'Your account is pending review by the system administrator.'),
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyNow = async () => {
    const targetEmail = unverifiedEmail || formData.email.trim();
    if (!targetEmail) return;
    setSendingVerifyNow(true);
    try {
      await api.post('/auth/resend-otp', {
        email: targetEmail.toLowerCase(),
        purpose: 'verify_email',
      });
      toast.success('Fresh verification code sent to your inbox!');
      navigate('/verify-email', { state: { email: targetEmail } });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send verification code');
      navigate('/verify-email', { state: { email: targetEmail } });
    } finally {
      setSendingVerifyNow(false);
    }
  };

  // Helper quick-fill credentials for demo / quick test
  const fillCredentials = (email, password) => {
    setFormData({ email, password });
    setErrors({});
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Brand Icon */}
        <div className="mx-auto w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-600/30">
          <GraduationCap className="w-8 h-8" />
        </div>
        <h2 className="mt-4 text-center text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Placement Portal
        </h2>
        <p className="mt-1 text-center text-sm text-slate-600">
          Sign in to access your placement dashboard
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 shadow-xl shadow-slate-200/50 rounded-2xl sm:px-10 border border-slate-200/80">
          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            {/* Email Field */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Email Address
              </label>
              <div className="relative rounded-xl shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="name@college.com"
                  className={`block w-full pl-10 pr-3 py-2.5 sm:text-sm rounded-xl border ${
                    errors.email
                      ? 'border-rose-300 focus:ring-rose-500 focus:border-rose-500'
                      : 'border-slate-300 focus:ring-indigo-500 focus:border-indigo-500'
                  } focus:outline-none focus:ring-2`}
                />
              </div>
              {errors.email && (
                <p className="mt-1 text-xs text-rose-600 font-medium">{errors.email}</p>
              )}
            </div>

            {/* Unverified Email Alert & Verify Now action */}
            {unverifiedEmail && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Email not verified yet</p>
                    <p className="text-[11px] text-amber-700">Please verify your email address to log in.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleVerifyNow}
                  disabled={sendingVerifyNow}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer self-start sm:self-auto"
                >
                  <span>{sendingVerifyNow ? 'Sending Code...' : 'Verify Now'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Unapproved Account Notice with What Happens Next */}
            {unapprovedNotice && (
              <div className="p-4 bg-amber-50/90 border border-amber-300 rounded-2xl text-xs text-amber-950 space-y-2.5 shadow-xs">
                <div className="flex items-start gap-2.5">
                  <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold text-amber-950 text-sm leading-snug">
                      Approval Waiting
                    </p>
                    <p className="mt-1 text-xs text-amber-800 leading-relaxed font-medium">
                      {unapprovedNotice.message}
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t border-amber-200/80 bg-amber-100/60 -mx-4 -mb-4 px-4 py-2.5 rounded-b-2xl">
                  <p className="text-[11px] font-semibold text-amber-900">
                    <span className="font-bold uppercase tracking-wider text-amber-950 mr-1.5">What happens next:</span>
                    <span className="font-medium text-amber-800">{unapprovedNotice.whatNext}</span>
                  </p>
                </div>
              </div>
            )}

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative rounded-xl shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className={`block w-full pl-10 pr-3 py-2.5 sm:text-sm rounded-xl border ${
                    errors.password
                      ? 'border-rose-300 focus:ring-rose-500 focus:border-rose-500'
                      : 'border-slate-300 focus:ring-indigo-500 focus:border-indigo-500'
                  } focus:outline-none focus:ring-2`}
                />
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-rose-600 font-medium">{errors.password}</p>
              )}
            </div>

            {/* Submit Button */}
            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl shadow-md text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all disabled:opacity-60 cursor-pointer"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Quick Credential Helpers (Development only, stripped in production build) */}
          {import.meta.env.DEV && DevQuickCredentials && (
            <DevQuickCredentials onFill={fillCredentials} />
          )}

          {/* Register Link */}
          <div className="mt-6 text-center">
            <p className="text-xs text-slate-600">
              New here?{' '}
              <Link
                to="/register"
                className="font-semibold text-indigo-600 hover:text-indigo-500 hover:underline"
              >
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;

