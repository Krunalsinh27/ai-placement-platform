import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import api from '../../services/api';
import { Mail, CheckCircle2, AlertCircle, ArrowLeft, RotateCw, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';

const VerifyEmail = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Read email from router state or query param
  const queryEmail = new URLSearchParams(location.search).get('email');
  const initialEmail = location.state?.email || queryEmail || '';

  const [email, setEmail] = useState(initialEmail);
  const [devOtp, setDevOtp] = useState(location.state?.devOtp || '');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const [errorMsg, setErrorMsg] = useState('');

  const inputRefs = useRef([]);

  // Cooldown timer
  useEffect(() => {
    let timer = null;
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [cooldown]);

  // Focus first input on mount
  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  // Handle digit change
  const handleChange = (index, value) => {
    const digit = value.replace(/[^0-9]/g, '');
    const newDigits = [...otpDigits];

    if (!digit) {
      newDigits[index] = '';
      setOtpDigits(newDigits);
      return;
    }

    newDigits[index] = digit[digit.length - 1]; // take last entered digit
    setOtpDigits(newDigits);
    setErrorMsg('');

    // Focus next box
    if (index < 5 && digit) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  // Handle keydown for backspace
  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Handle Paste of 6-digit code
  const handlePaste = (e) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').trim().replace(/[^0-9]/g, '');
    if (pasteData.length > 0) {
      const digits = pasteData.slice(0, 6).split('');
      const newDigits = ['', '', '', '', '', ''];
      digits.forEach((d, i) => {
        if (i < 6) newDigits[i] = d;
      });
      setOtpDigits(newDigits);
      setErrorMsg('');

      const focusIdx = Math.min(digits.length, 5);
      inputRefs.current[focusIdx]?.focus();
    }
  };

  // Handle verify submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    const fullOtp = otpDigits.join('');

    if (!email.trim()) {
      setErrorMsg('Please enter your email address');
      return;
    }

    if (fullOtp.length !== 6) {
      setErrorMsg('Please enter all 6 digits of the verification code');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const res = await api.post('/auth/verify-email', {
        email: email.trim().toLowerCase(),
        otp: fullOtp,
      });

      if (res.data.success) {
        toast.success(res.data.message || 'Email verified successfully! Please log in.');
        navigate('/login', {
          replace: true,
          state: { verifiedEmail: email.trim().toLowerCase() },
        });
      }
    } catch (err) {
      const message = err.response?.data?.message || 'Verification failed. Please try again.';
      setErrorMsg(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Resend OTP
  const handleResend = async () => {
    if (cooldown > 0 || resending) return;

    if (!email.trim()) {
      toast.error('Please provide your email address first');
      return;
    }

    setResending(true);
    setErrorMsg('');

    try {
      const res = await api.post('/auth/resend-otp', {
        email: email.trim().toLowerCase(),
        purpose: 'verify_email',
      });

      toast.success(res.data.message || 'Verification code resent! Please check your inbox.');
      if (res.data.devOtp) {
        setDevOtp(res.data.devOtp);
      }
      setCooldown(60);
      setOtpDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to resend code';
      toast.error(message);
      if (err.response?.data?.cooldownRemaining) {
        setCooldown(err.response.data.cooldownRemaining);
      }
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Brand Icon */}
        <div className="mx-auto w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-600/30">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h2 className="mt-4 text-center text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Verify Your Email
        </h2>
        <p className="mt-1.5 text-center text-sm text-slate-600 px-4">
          Enter the 6-digit code sent to{' '}
          <span className="font-semibold text-slate-800">{email || 'your email address'}</span>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 shadow-xl shadow-slate-200/50 rounded-2xl sm:px-10 border border-slate-200/80">
          {devOtp && (
            <div className="mb-6 p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center justify-between gap-2 shadow-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-extrabold uppercase tracking-wider text-[10px] bg-amber-200 text-amber-800 px-2 py-0.5 rounded shrink-0">
                  Demo Mode
                </span>
                <span className="truncate">
                  OTP Code:{' '}
                  <strong className="font-mono text-sm tracking-widest text-indigo-700">
                    {devOtp}
                  </strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const digits = String(devOtp).split('').slice(0, 6);
                  setOtpDigits(digits);
                }}
                className="px-2.5 py-1 bg-amber-200 hover:bg-amber-300 text-amber-900 font-bold rounded-lg text-xs transition-colors cursor-pointer shrink-0"
              >
                Fill OTP
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email input (editable if needed) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <div className="relative rounded-xl shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@college.com"
                  required
                  className="block w-full pl-10 pr-3 py-2.5 sm:text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            {/* 6 Digit OTP Inputs */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 text-center">
                6-Digit Verification Code
              </label>
              <div className="flex justify-between items-center gap-2 sm:gap-2.5" onPaste={handlePaste}>
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => (inputRefs.current[idx] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    className="w-11 h-13 sm:w-12 sm:h-14 text-center text-2xl font-extrabold text-slate-900 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-indigo-600 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all"
                  />
                ))}
              </div>
              <p className="text-[11px] text-center text-slate-400 mt-2">
                Tip: You can paste the 6-digit code directly
              </p>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-700 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Verify Button */}
            <button
              type="submit"
              disabled={submitting || otpDigits.join('').length !== 6}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl shadow-md text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Verify Email & Activate Account</span>
                </>
              )}
            </button>

            {/* Resend OTP Section */}
            <div className="pt-2 border-t border-slate-100 text-center">
              <p className="text-xs text-slate-500">
                Didn't receive the email?{' '}
                {cooldown > 0 ? (
                  <span className="font-semibold text-slate-400">
                    Resend code in {cooldown}s
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resending}
                    className="font-semibold text-indigo-600 hover:text-indigo-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
                    <span>Resend Code</span>
                  </button>
                )}
              </p>
            </div>

            {/* Return to Login */}
            <div className="text-center pt-2">
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Login
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;

