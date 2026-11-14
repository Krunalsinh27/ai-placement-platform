import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import {
  GraduationCap,
  Shield,
  Building2,
  User,
  Mail,
  Lock,
  Hash,
  BookOpen,
  Calendar,
  Award,
  AlertCircle,
  Phone,
  Code2,
  Globe,
  FileText,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  BarChart3,
  Briefcase,
  Compass,
  ArrowLeft,
  School,
  Layers,
  HelpCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { validatePasswordPolicy } from '../../utils/passwordPolicy';
import {
  INDIAN_STATES_AND_UTS as INDIAN_STATES,
  TWELFTH_STREAMS,
  BRANCH_OPTIONS,
} from '../../constants/aspirantConstants';

const ORGANISATION_TYPES = [
  'University',
  'Government department',
  'Accreditation body',
  'Researcher',
  'Other',
];

const PASSWORD_RULE_TEXT =
  'Password must be at least 10 characters long, not easily guessed, and cannot contain parts of your name or email';

const Register = () => {
  // First Screen: null -> "I am a..." card selector
  // Value can be: 'aspirant' | 'student' | 'tpo' | 'recruiter' | 'analyst'
  const [selectedRole, setSelectedRole] = useState(null);

  const [colleges, setColleges] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [collegesLoading, setCollegesLoading] = useState(true);

  // Aspirant (Prospective Student) Form State
  const [aspirantForm, setAspirantForm] = useState({
    name: '',
    email: '',
    password: '',
    state: 'Delhi',
    interestedBranches: ['CSE', 'IT'],
    twelfthStream: 'Science (PCM - Physics, Chemistry, Maths)',
  });

  // Student Form State
  const [studentForm, setStudentForm] = useState({
    name: '',
    email: '',
    password: '',
    college: '',
    enrollmentNo: '',
    branch: 'CSE',
    batchYear: new Date().getFullYear(),
    cgpa: '',
    backlogs: '0',
    phone: '',
    skills: '',
  });

  // TPO Mode & Form State
  const [tpoMode, setTpoMode] = useState('join'); // 'join' | 'new'
  const [tpoForm, setTpoForm] = useState({
    name: '',
    email: '',
    password: '',
    college: '',
    phone: '',
  });

  // Register New College + First TPO Form State
  const [newCollegeForm, setNewCollegeForm] = useState({
    collegeName: '',
    collegeCode: '',
    city: '',
    state: 'Delhi',
    website: '',
    contactEmail: '',
    contactPhone: '',
    accreditation: '',
    tpoName: '',
    tpoEmail: '',
    tpoPassword: '',
    tpoPhone: '',
  });

  // Recruiter Form State
  const [recruiterForm, setRecruiterForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    companyMode: 'new', // 'new' | 'existing'
    companyId: '',
    companyName: '',
    industry: 'Technology & Cloud Solutions',
    website: '',
    description: '',
    logoUrl: '',
  });

  // Analyst / Observer Form State
  const [analystForm, setAnalystForm] = useState({
    name: '',
    email: '',
    organisation: '',
    organisationType: 'Researcher',
    purpose: '',
    designation: '',
    password: '',
  });

  const [errors, setErrors] = useState({});
  const [alreadyRegisteredError, setAlreadyRegisteredError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    registerTPO,
    registerCollege,
    registerRecruiter,
    registerAnalyst,
    registerAspirant,
  } = useAuth();
  const navigate = useNavigate();

  // Load public colleges & companies on mount
  useEffect(() => {
    const fetchDirectory = async () => {
      try {
        const [collegesRes, companiesRes] = await Promise.all([
          api.get('/colleges'),
          api.get('/companies').catch(() => ({ data: { companies: [] } })),
        ]);

        if (collegesRes.data.success && collegesRes.data.colleges.length > 0) {
          setColleges(collegesRes.data.colleges);
          const firstCollegeId = collegesRes.data.colleges[0]._id;
          setStudentForm((prev) => ({ ...prev, college: prev.college || firstCollegeId }));
          setTpoForm((prev) => ({ ...prev, college: prev.college || firstCollegeId }));
        }

        if (companiesRes.data.companies && companiesRes.data.companies.length > 0) {
          setCompanies(companiesRes.data.companies);
          setRecruiterForm((prev) => ({
            ...prev,
            companyId: prev.companyId || companiesRes.data.companies[0]._id,
          }));
        }
      } catch (err) {
        console.error('Failed to load directory:', err);
      } finally {
        setCollegesLoading(false);
      }
    };

    fetchDirectory();
  }, []);

  // Form Change Handlers
  const handleAspirantChange = (e) => {
    if (alreadyRegisteredError) setAlreadyRegisteredError(null);
    const { name, value } = e.target;
    setAspirantForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleBranchToggle = (branch) => {
    setAspirantForm((prev) => {
      const exists = prev.interestedBranches.includes(branch);
      const updated = exists
        ? prev.interestedBranches.filter((b) => b !== branch)
        : [...prev.interestedBranches, branch];
      return { ...prev, interestedBranches: updated };
    });
  };

  const handleStudentChange = (e) => {
    if (alreadyRegisteredError) setAlreadyRegisteredError(null);
    const { name, value } = e.target;
    setStudentForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleTpoChange = (e) => {
    if (alreadyRegisteredError) setAlreadyRegisteredError(null);
    const { name, value } = e.target;
    setTpoForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleNewCollegeChange = (e) => {
    if (alreadyRegisteredError) setAlreadyRegisteredError(null);
    const { name, value } = e.target;
    const finalVal = name === 'collegeCode' ? value.toUpperCase() : value;
    setNewCollegeForm((prev) => ({ ...prev, [name]: finalVal }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleRecruiterChange = (e) => {
    if (alreadyRegisteredError) setAlreadyRegisteredError(null);
    const { name, value } = e.target;
    setRecruiterForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleAnalystChange = (e) => {
    if (alreadyRegisteredError) setAlreadyRegisteredError(null);
    const { name, value } = e.target;
    setAnalystForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  // Validations
  const validateAspirant = () => {
    const newErrors = {};
    if (!aspirantForm.name.trim()) newErrors.name = 'Full name is required';
    if (!aspirantForm.email.trim()) {
      newErrors.email = 'Email address is required';
    } else if (!/^\S+@\S+\.\S+$/.test(aspirantForm.email)) {
      newErrors.email = 'Please provide a valid email address';
    }

    if (!aspirantForm.password) {
      newErrors.password = 'Password is required';
    } else {
      const pCheck = validatePasswordPolicy(aspirantForm.password, { email: aspirantForm.email, name: aspirantForm.name });
      if (!pCheck.valid) newErrors.password = pCheck.message;
    }

    if (!aspirantForm.state.trim()) newErrors.state = 'State / Region is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStudent = () => {
    const newErrors = {};
    if (!studentForm.name.trim()) newErrors.name = 'Full name is required';
    if (!studentForm.email.trim()) {
      newErrors.email = 'Email address is required';
    } else if (!/^\S+@\S+\.\S+$/.test(studentForm.email)) {
      newErrors.email = 'Please provide a valid email address';
    }

    if (!studentForm.password) {
      newErrors.password = 'Password is required';
    } else {
      const pCheck = validatePasswordPolicy(studentForm.password, { email: studentForm.email, name: studentForm.name });
      if (!pCheck.valid) newErrors.password = pCheck.message;
    }

    if (!studentForm.college) newErrors.college = 'Please select your college';
    if (!studentForm.enrollmentNo.trim()) newErrors.enrollmentNo = 'Enrollment number is required';
    if (!studentForm.branch) newErrors.branch = 'Branch selection is required';

    if (!studentForm.batchYear) {
      newErrors.batchYear = 'Batch year is required';
    } else if (Number(studentForm.batchYear) < 2000 || Number(studentForm.batchYear) > 2100) {
      newErrors.batchYear = 'Please enter a valid batch year';
    }

    if (studentForm.cgpa === '' || studentForm.cgpa === null) {
      newErrors.cgpa = 'CGPA is required';
    } else {
      const numCgpa = Number(studentForm.cgpa);
      if (isNaN(numCgpa) || numCgpa < 0 || numCgpa > 10) {
        newErrors.cgpa = 'CGPA must be between 0.0 and 10.0';
      }
    }

    if (studentForm.backlogs === '' || studentForm.backlogs === null) {
      newErrors.backlogs = 'Backlogs count is required';
    } else if (Number(studentForm.backlogs) < 0) {
      newErrors.backlogs = 'Backlogs cannot be negative';
    }

    if (!studentForm.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!/^[0-9+\s-]{8,15}$/.test(studentForm.phone.trim())) {
      newErrors.phone = 'Please provide a valid phone number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateTPO = () => {
    const newErrors = {};
    if (!tpoForm.name.trim()) newErrors.name = 'Full name is required';
    if (!tpoForm.email.trim()) {
      newErrors.email = 'Official email address is required';
    } else if (!/^\S+@\S+\.\S+$/.test(tpoForm.email)) {
      newErrors.email = 'Please provide a valid email address';
    }

    if (!tpoForm.password) {
      newErrors.password = 'Password is required';
    } else {
      const pCheck = validatePasswordPolicy(tpoForm.password, { email: tpoForm.email, name: tpoForm.name });
      if (!pCheck.valid) newErrors.password = pCheck.message;
    }

    if (!tpoForm.college) newErrors.college = 'Please select your affiliated college';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateNewCollege = () => {
    const newErrors = {};
    if (!newCollegeForm.collegeName.trim()) newErrors.collegeName = 'College name is required';
    if (!newCollegeForm.collegeCode.trim()) newErrors.collegeCode = 'College code is required';
    if (!newCollegeForm.city.trim()) newErrors.city = 'City is required';
    if (!newCollegeForm.state.trim()) newErrors.state = 'State is required';

    if (!newCollegeForm.tpoName.trim()) newErrors.tpoName = 'Officer full name is required';
    if (!newCollegeForm.tpoEmail.trim()) {
      newErrors.tpoEmail = 'Official email address is required';
    } else if (!/^\S+@\S+\.\S+$/.test(newCollegeForm.tpoEmail)) {
      newErrors.tpoEmail = 'Please provide a valid email address';
    }

    if (!newCollegeForm.tpoPassword) {
      newErrors.tpoPassword = 'Password is required';
    } else {
      const pCheck = validatePasswordPolicy(newCollegeForm.tpoPassword, { email: newCollegeForm.tpoEmail, name: newCollegeForm.tpoName });
      if (!pCheck.valid) newErrors.tpoPassword = pCheck.message;
    }

    if (!newCollegeForm.tpoPhone.trim()) newErrors.tpoPhone = 'Contact phone number is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateRecruiter = () => {
    const newErrors = {};
    if (!recruiterForm.name.trim()) newErrors.name = 'Recruiter name is required';
    if (!recruiterForm.email.trim()) {
      newErrors.email = 'Official corporate email is required';
    } else if (!/^\S+@\S+\.\S+$/.test(recruiterForm.email)) {
      newErrors.email = 'Please provide a valid corporate email';
    }

    if (!recruiterForm.password) {
      newErrors.password = 'Password is required';
    } else {
      const pCheck = validatePasswordPolicy(recruiterForm.password, { email: recruiterForm.email, name: recruiterForm.name });
      if (!pCheck.valid) newErrors.password = pCheck.message;
    }

    if (recruiterForm.companyMode === 'new') {
      if (!recruiterForm.companyName.trim()) newErrors.companyName = 'Company name is required';
      if (!recruiterForm.industry.trim()) newErrors.industry = 'Industry classification is required';
    } else {
      if (!recruiterForm.companyId) newErrors.companyId = 'Please select your registered company';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateAnalyst = () => {
    const newErrors = {};
    if (!analystForm.name.trim()) newErrors.name = 'Full name is required';
    if (!analystForm.email.trim()) {
      newErrors.email = 'Email address is required';
    } else if (!/^\S+@\S+\.\S+$/.test(analystForm.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    if (!analystForm.organisation.trim()) {
      newErrors.organisation = 'Organisation or institution name is required';
    }
    if (!analystForm.purpose.trim()) {
      newErrors.purpose = 'Purpose of requesting access is required';
    }
    if (!analystForm.password) {
      newErrors.password = 'Password is required';
    } else {
      const pCheck = validatePasswordPolicy(analystForm.password, { email: analystForm.email, name: analystForm.name });
      if (!pCheck.valid) newErrors.password = pCheck.message;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Submit Handlers
  const handleAspirantSubmit = async (e) => {
    e.preventDefault();
    if (!validateAspirant()) {
      toast.error('Please fix the errors in the form');
      return;
    }

    setIsSubmitting(true);
    setAlreadyRegisteredError(null);
    try {
      const payload = {
        name: aspirantForm.name.trim(),
        email: aspirantForm.email.trim().toLowerCase(),
        password: aspirantForm.password,
        state: aspirantForm.state.trim(),
        interestedBranches: aspirantForm.interestedBranches,
        twelfthStream: aspirantForm.twelfthStream.trim(),
      };

      const data = await registerAspirant(payload);
      toast.success(data.message || 'Registration successful! Please check your email for the OTP verification code.');
      navigate('/verify-email', { replace: true, state: { email: payload.email, devOtp: data?.devOtp } });
    } catch (err) {
      if (err.response?.status === 409) {
        setAlreadyRegisteredError(err.response?.data?.message || 'This email is already registered. Log in, or use Forgot password.');
      }
      toast.error(err.response?.data?.message || 'Aspirant registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStudentSubmit = async (e) => {
    e.preventDefault();
    if (!validateStudent()) {
      toast.error('Please fix the errors in the form');
      return;
    }

    setIsSubmitting(true);
    setAlreadyRegisteredError(null);
    try {
      const payload = {
        name: studentForm.name.trim(),
        email: studentForm.email.trim().toLowerCase(),
        password: studentForm.password,
        college: studentForm.college,
        enrollmentNo: studentForm.enrollmentNo.trim().toUpperCase(),
        branch: studentForm.branch,
        batchYear: Number(studentForm.batchYear),
        cgpa: Number(studentForm.cgpa),
        backlogs: Number(studentForm.backlogs),
        phone: studentForm.phone.trim(),
        skills: studentForm.skills
          ? studentForm.skills.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
      };

      const data = await register(payload);
      toast.success(data.message || 'Registration successful! Please check your email for the verification code.');
      navigate('/verify-email', { replace: true, state: { email: payload.email, devOtp: data?.devOtp } });
    } catch (err) {
      if (err.response?.status === 409) {
        setAlreadyRegisteredError(err.response?.data?.message || 'This email is already registered. Log in, or use Forgot password.');
      }
      toast.error(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTpoSubmit = async (e) => {
    e.preventDefault();
    if (!validateTPO()) {
      toast.error('Please fix the errors in the form');
      return;
    }

    setIsSubmitting(true);
    setAlreadyRegisteredError(null);
    try {
      const payload = {
        name: tpoForm.name.trim(),
        email: tpoForm.email.trim().toLowerCase(),
        password: tpoForm.password,
        college: tpoForm.college,
        phone: tpoForm.phone.trim(),
      };

      const data = await registerTPO(payload);
      toast.success(data.message || 'Registration submitted! Please verify your email.');
      navigate('/verify-email', { replace: true, state: { email: payload.email, devOtp: data?.devOtp } });
    } catch (err) {
      if (err.response?.status === 409) {
        setAlreadyRegisteredError(err.response?.data?.message || 'This email is already registered. Log in, or use Forgot password.');
      }
      toast.error(err.response?.data?.message || 'TPO Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewCollegeSubmit = async (e) => {
    e.preventDefault();
    if (!validateNewCollege()) {
      toast.error('Please fix the errors in the form');
      return;
    }

    setIsSubmitting(true);
    setAlreadyRegisteredError(null);
    try {
      const payload = {
        collegeName: newCollegeForm.collegeName.trim(),
        collegeCode: newCollegeForm.collegeCode.trim().toUpperCase(),
        city: newCollegeForm.city.trim(),
        state: newCollegeForm.state.trim(),
        website: newCollegeForm.website.trim(),
        contactEmail: newCollegeForm.contactEmail.trim().toLowerCase(),
        contactPhone: newCollegeForm.contactPhone.trim(),
        accreditation: newCollegeForm.accreditation.trim(),
        tpoName: newCollegeForm.tpoName.trim(),
        tpoEmail: newCollegeForm.tpoEmail.trim().toLowerCase(),
        tpoPassword: newCollegeForm.tpoPassword,
        tpoPhone: newCollegeForm.tpoPhone.trim(),
      };

      const data = await registerCollege(payload);
      toast.success(data.message || 'College registered! Please verify your email.');

      if (data.college) {
        setColleges((prev) => [data.college, ...prev]);
      }

      navigate('/verify-email', { replace: true, state: { email: payload.tpoEmail, devOtp: data?.devOtp } });
    } catch (err) {
      if (err.response?.status === 409) {
        setAlreadyRegisteredError(err.response?.data?.message || 'This email is already registered. Log in, or use Forgot password.');
      }
      toast.error(err.response?.data?.message || 'College registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecruiterSubmit = async (e) => {
    e.preventDefault();
    if (!validateRecruiter()) {
      toast.error('Please fix the errors in the form');
      return;
    }

    setIsSubmitting(true);
    setAlreadyRegisteredError(null);
    try {
      const payload = {
        name: recruiterForm.name.trim(),
        email: recruiterForm.email.trim().toLowerCase(),
        password: recruiterForm.password,
        phone: recruiterForm.phone.trim(),
        ...(recruiterForm.companyMode === 'existing'
          ? { companyId: recruiterForm.companyId }
          : {
              companyName: recruiterForm.companyName.trim(),
              industry: recruiterForm.industry.trim(),
              website: recruiterForm.website.trim(),
              description: recruiterForm.description.trim(),
              logoUrl: recruiterForm.logoUrl.trim(),
            }),
      };

      const data = await registerRecruiter(payload);
      toast.success(data.message || 'Recruiter registered! Please verify your corporate email.');
      navigate('/verify-email', { replace: true, state: { email: payload.email, devOtp: data?.devOtp } });
    } catch (err) {
      if (err.response?.status === 409) {
        setAlreadyRegisteredError(err.response?.data?.message || 'This email is already registered. Log in, or use Forgot password.');
      }
      toast.error(err.response?.data?.message || 'Recruiter Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAnalystSubmit = async (e) => {
    e.preventDefault();
    if (!validateAnalyst()) {
      toast.error('Please fix the errors in the form');
      return;
    }

    setIsSubmitting(true);
    setAlreadyRegisteredError(null);
    try {
      const payload = {
        name: analystForm.name.trim(),
        email: analystForm.email.trim().toLowerCase(),
        organisation: analystForm.organisation.trim(),
        organisationType: analystForm.organisationType.trim(),
        purpose: analystForm.purpose.trim(),
        designation: analystForm.designation.trim(),
        password: analystForm.password,
      };

      const data = await registerAnalyst(payload);
      toast.success(data.message || 'Analyst registered! Please verify your email with the OTP code.');
      navigate('/verify-email', { replace: true, state: { email: payload.email, devOtp: data?.devOtp } });
    } catch (err) {
      if (err.response?.status === 409) {
        setAlreadyRegisteredError(err.response?.data?.message || 'This email is already registered. Log in, or use Forgot password.');
      }
      toast.error(err.response?.data?.message || 'Analyst Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // =========================================================================
  // VIEW 1: FIRST SCREEN "I am a..." ROLE SELECTION CARDS
  // =========================================================================
  if (!selectedRole) {
    const roles = [
      {
        id: 'aspirant',
        title: 'Prospective student',
        subtitle: 'Before admission',
        desc: 'Explore benchmark placement records across universities, compare colleges side-by-side, and track admission placement statistics.',
        icon: Compass,
        accent: 'teal',
        badge: 'Public & Benchmarks',
      },
      {
        id: 'student',
        title: 'College student',
        subtitle: 'Currently enrolled',
        desc: 'Participate in campus placement drives, track multi-round recruitment pipelines, take platform aptitude tests, and receive job offers.',
        icon: GraduationCap,
        accent: 'indigo',
        badge: 'Campus Placement',
      },
      {
        id: 'tpo',
        title: 'College TPO',
        subtitle: 'Placement Cell Officer',
        desc: 'Register and manage your institutional placement office, approve student batches, coordinate company drives, and track statistics.',
        icon: Building2,
        accent: 'purple',
        badge: 'Institution Admin',
      },
      {
        id: 'recruiter',
        title: 'Employer / Recruiter',
        subtitle: 'Campus Talent Partner',
        desc: 'Post verified hiring requirements, schedule multi-college campus drives, evaluate interview slots, and extend job offers.',
        icon: Briefcase,
        accent: 'sky',
        badge: 'Corporate Talent',
      },
      {
        id: 'analyst',
        title: 'Analyst / Observer',
        subtitle: 'Higher Ed Research',
        desc: 'Access nationwide aggregate recruitment intelligence across approved institutions with small-group suppression (k-anonymity, k=5) protection.',
        icon: BarChart3,
        accent: 'amber',
        badge: 'Research Access',
      },
    ];

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto w-full space-y-8">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="mx-auto w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-600/25">
              <GraduationCap className="w-8 h-8" />
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              Create Your Account
            </h1>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Welcome to the centralized Higher Education Placement Portal. Select your role to continue.
            </p>
          </div>

          {/* Cards Grid: "I am a..." */}
          <div>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest text-center mb-4">
              I am a...
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {roles.map((r) => {
                const IconComponent = r.icon;
                return (
                  <button
                    key={r.id}
                    onClick={() => {
                      setSelectedRole(r.id);
                      setErrors({});
                      setAlreadyRegisteredError(null);
                    }}
                    className="flex flex-col text-left p-6 bg-white rounded-2xl border-2 border-slate-200/90 hover:border-indigo-600 hover:shadow-lg transition-all duration-200 group cursor-pointer relative"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 group-hover:bg-indigo-50 flex items-center justify-center text-slate-700 group-hover:text-indigo-600 transition-colors">
                        <IconComponent className="w-6 h-6" />
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-800 transition-colors">
                        {r.badge}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {r.title}
                    </h3>
                    <span className="text-xs font-semibold text-slate-500 mb-2">
                      ({r.subtitle})
                    </span>

                    <p className="text-xs text-slate-500 leading-relaxed mt-1 flex-1">
                      {r.desc}
                    </p>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-indigo-600">
                      <span>Continue to form</span>
                      <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Login prompt */}
          <div className="text-center pt-2">
            <p className="text-xs text-slate-500">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-500 hover:underline">
                Sign in here
              </Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: SINGLE ROLE FORM WITH TOP "← Change role" BUTTON
  // =========================================================================
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl">
        {/* Top Back / Change Role Button */}
        <button
          onClick={() => {
            setSelectedRole(null);
            setErrors({});
            setAlreadyRegisteredError(null);
          }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-600 mb-4 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Change role selection</span>
        </button>

        {/* Brand Icon & Heading */}
        <div className="mx-auto w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
          {selectedRole === 'aspirant' && <Compass className="w-7 h-7" />}
          {selectedRole === 'student' && <GraduationCap className="w-7 h-7" />}
          {selectedRole === 'tpo' && <Shield className="w-7 h-7" />}
          {selectedRole === 'recruiter' && <Briefcase className="w-7 h-7" />}
          {selectedRole === 'analyst' && <BarChart3 className="w-7 h-7" />}
        </div>

        <h2 className="mt-3 text-center text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          {selectedRole === 'aspirant' && 'Prospective Student Registration'}
          {selectedRole === 'student' && 'College Student Registration'}
          {selectedRole === 'tpo' && 'TPO Officer Registration'}
          {selectedRole === 'recruiter' && 'Corporate Recruiter Registration'}
          {selectedRole === 'analyst' && 'Placement Analyst / Observer Registration'}
        </h2>

        <p className="mt-1 text-center text-sm text-slate-600">
          {selectedRole === 'aspirant' && 'Explore and compare institutional placement benchmarks before admission'}
          {selectedRole === 'student' && 'Set up your academic profile to participate in campus recruitment drives'}
          {selectedRole === 'tpo' && 'Register your institutional placement office or join an existing college'}
          {selectedRole === 'recruiter' && 'Join as employer to host campus recruitment drives and hire talent'}
          {selectedRole === 'analyst' && 'Observer access to national higher education placement analytics'}
        </p>

        {/* Selected Role Badge */}
        <div className="mt-3 text-center">
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <span>Role:</span>
            <span className="capitalize font-bold">
              {selectedRole === 'aspirant' ? 'Prospective Student (Aspirant)' : selectedRole}
            </span>
          </span>
        </div>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="bg-white py-8 px-6 shadow-xl shadow-slate-200/50 rounded-2xl sm:px-10 border border-slate-200/80">
          {alreadyRegisteredError && (
            <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold">{alreadyRegisteredError}</p>
                <div className="mt-2 flex items-center gap-3">
                  <Link
                    to="/login"
                    className="inline-flex items-center text-xs font-bold text-amber-800 underline hover:text-amber-950"
                  >
                    Log in
                  </Link>
                  <span className="text-amber-400">•</span>
                  <Link
                    to="/forgot-password"
                    className="inline-flex items-center text-xs font-bold text-amber-800 underline hover:text-amber-950"
                  >
                    Use Forgot password
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* 1. ASPIRANT FORM                                                  */}
          {/* ================================================================= */}
          {selectedRole === 'aspirant' && (
            <form onSubmit={handleAspirantSubmit} className="space-y-5" noValidate>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Full Name *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    name="name"
                    value={aspirantForm.name}
                    onChange={handleAspirantChange}
                    placeholder="e.g. Aarav Sharma"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                {errors.name && <p className="text-xs text-rose-600 mt-1">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Email Address *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    name="email"
                    value={aspirantForm.email}
                    onChange={handleAspirantChange}
                    placeholder="your.email@gmail.com"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                {errors.email && <p className="text-xs text-rose-600 mt-1">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Password *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="password"
                    name="password"
                    value={aspirantForm.password}
                    onChange={handleAspirantChange}
                    placeholder="Min 8 characters with letters & numbers"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Must be at least 8 characters long, containing at least one letter and one number.
                </p>
                {errors.password && <p className="text-xs text-rose-600 mt-1">{errors.password}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Home State / Region *
                  </label>
                  <select
                    name="state"
                    value={aspirantForm.state}
                    onChange={handleAspirantChange}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                  >
                    {INDIAN_STATES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                  {errors.state && <p className="text-xs text-rose-600 mt-1">{errors.state}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    12th Standard Stream (Optional)
                  </label>
                  <select
                    name="twelfthStream"
                    value={aspirantForm.twelfthStream}
                    onChange={handleAspirantChange}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                  >
                    {TWELFTH_STREAMS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Interested Branches Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Interested Disciplines / Branches
                </label>
                <div className="flex flex-wrap gap-2">
                  {BRANCH_OPTIONS.map((br) => {
                    const isSelected = aspirantForm.interestedBranches.includes(br);
                    return (
                      <button
                        type="button"
                        key={br}
                        onClick={() => handleBranchToggle(br)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-teal-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {br}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Click to toggle disciplines you want to explore colleges for.
                </p>
              </div>

              <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-xs text-teal-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                <span>
                  No college affiliation or enrollment number required. Prospective students get instant access to public benchmarks, college comparisons, and shortlist tools upon OTP email verification.
                </span>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 rounded-xl text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 transition-colors shadow-lg shadow-teal-600/30 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>{isSubmitting ? 'Registering...' : 'Create Prospective Student Account'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* ================================================================= */}
          {/* 2. STUDENT FORM                                                   */}
          {/* ================================================================= */}
          {selectedRole === 'student' && (
            <form onSubmit={handleStudentSubmit} className="space-y-5" noValidate>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={studentForm.name}
                    onChange={handleStudentChange}
                    placeholder="e.g. Rahul Sharma"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  {errors.name && <p className="text-xs text-rose-600 mt-1">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    College Email *
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={studentForm.email}
                    onChange={handleStudentChange}
                    placeholder="student@college.edu"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  {errors.email && <p className="text-xs text-rose-600 mt-1">{errors.email}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Password *
                  </label>
                  <input
                    type="password"
                    name="password"
                    value={studentForm.password}
                    onChange={handleStudentChange}
                    placeholder="Min 8 characters with letters & numbers"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Must be at least 8 characters long, containing at least one letter and one number.
                  </p>
                  {errors.password && <p className="text-xs text-rose-600 mt-1">{errors.password}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Affiliated College *
                  </label>
                  <select
                    name="college"
                    value={studentForm.college}
                    onChange={handleStudentChange}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                  >
                    {colleges.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                  {errors.college && <p className="text-xs text-rose-600 mt-1">{errors.college}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Enrollment No *
                  </label>
                  <input
                    type="text"
                    name="enrollmentNo"
                    value={studentForm.enrollmentNo}
                    onChange={handleStudentChange}
                    placeholder="e.g. 0101CSE24001"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  {errors.enrollmentNo && <p className="text-xs text-rose-600 mt-1">{errors.enrollmentNo}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Branch *
                  </label>
                  <select
                    name="branch"
                    value={studentForm.branch}
                    onChange={handleStudentChange}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                  >
                    {BRANCH_OPTIONS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Batch Year *
                  </label>
                  <input
                    type="number"
                    name="batchYear"
                    value={studentForm.batchYear}
                    onChange={handleStudentChange}
                    placeholder="2026"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  {errors.batchYear && <p className="text-xs text-rose-600 mt-1">{errors.batchYear}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    CGPA (0 - 10) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    name="cgpa"
                    value={studentForm.cgpa}
                    onChange={handleStudentChange}
                    placeholder="8.50"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  {errors.cgpa && <p className="text-xs text-rose-600 mt-1">{errors.cgpa}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Active Backlogs *
                  </label>
                  <input
                    type="number"
                    name="backlogs"
                    value={studentForm.backlogs}
                    onChange={handleStudentChange}
                    placeholder="0"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  {errors.backlogs && <p className="text-xs text-rose-600 mt-1">{errors.backlogs}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Phone *
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={studentForm.phone}
                    onChange={handleStudentChange}
                    placeholder="9876543210"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  {errors.phone && <p className="text-xs text-rose-600 mt-1">{errors.phone}</p>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Technical Skills (Comma separated)
                </label>
                <input
                  type="text"
                  name="skills"
                  value={studentForm.skills}
                  onChange={handleStudentChange}
                  placeholder="React, Node.js, Python, Java"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/30 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>{isSubmitting ? 'Registering...' : 'Register as College Student'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* ================================================================= */}
          {/* 3. TPO FORM (Join vs New College)                                 */}
          {/* ================================================================= */}
          {selectedRole === 'tpo' && (
            <div className="space-y-6">
              {/* TPO Mode Selector: Join Existing vs Register New College */}
              <div className="flex p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setTpoMode('join')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    tpoMode === 'join'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Join Existing College
                </button>
                <button
                  type="button"
                  onClick={() => setTpoMode('new')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    tpoMode === 'new'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Register New College & TPO
                </button>
              </div>

              {tpoMode === 'join' ? (
                <form onSubmit={handleTpoSubmit} className="space-y-5" noValidate>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Officer Full Name *
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={tpoForm.name}
                      onChange={handleTpoChange}
                      placeholder="e.g. Prof. Rajesh Gupta"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    {errors.name && <p className="text-xs text-rose-600 mt-1">{errors.name}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Official College Email *
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={tpoForm.email}
                      onChange={handleTpoChange}
                      placeholder="tpo@college.edu"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    {errors.email && <p className="text-xs text-rose-600 mt-1">{errors.email}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Password *
                    </label>
                    <input
                      type="password"
                      name="password"
                      value={tpoForm.password}
                      onChange={handleTpoChange}
                      placeholder="Min 8 characters with letters & numbers"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Must be at least 8 characters long, containing at least one letter and one number.
                    </p>
                    {errors.password && <p className="text-xs text-rose-600 mt-1">{errors.password}</p>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Select Registered College *
                      </label>
                      <select
                        name="college"
                        value={tpoForm.college}
                        onChange={handleTpoChange}
                        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                      >
                        {colleges.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.name} ({c.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Contact Phone
                      </label>
                      <input
                        type="tel"
                        name="phone"
                        value={tpoForm.phone}
                        onChange={handleTpoChange}
                        placeholder="+91-9876543210"
                        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2.5 px-4 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/30 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>{isSubmitting ? 'Submitting...' : 'Join as College TPO'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <form onSubmit={handleNewCollegeSubmit} className="space-y-4" noValidate>
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider pb-1 border-b border-slate-100">
                    Institutional Details
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        College Full Name *
                      </label>
                      <input
                        type="text"
                        name="collegeName"
                        value={newCollegeForm.collegeName}
                        onChange={handleNewCollegeChange}
                        placeholder="e.g. National Institute of Technology Delhi"
                        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                      {errors.collegeName && <p className="text-xs text-rose-600 mt-1">{errors.collegeName}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        College Code *
                      </label>
                      <input
                        type="text"
                        name="collegeCode"
                        value={newCollegeForm.collegeCode}
                        onChange={handleNewCollegeChange}
                        placeholder="e.g. NITD"
                        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none uppercase"
                      />
                      {errors.collegeCode && <p className="text-xs text-rose-600 mt-1">{errors.collegeCode}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        City *
                      </label>
                      <input
                        type="text"
                        name="city"
                        value={newCollegeForm.city}
                        onChange={handleNewCollegeChange}
                        placeholder="New Delhi"
                        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                      {errors.city && <p className="text-xs text-rose-600 mt-1">{errors.city}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        State *
                      </label>
                      <select
                        name="state"
                        value={newCollegeForm.state}
                        onChange={handleNewCollegeChange}
                        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                      >
                        {INDIAN_STATES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                      {errors.state && <p className="text-xs text-rose-600 mt-1">{errors.state}</p>}
                    </div>
                  </div>

                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider pt-2 pb-1 border-b border-slate-100">
                    First TPO Officer Credentials
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Officer Full Name *
                      </label>
                      <input
                        type="text"
                        name="tpoName"
                        value={newCollegeForm.tpoName}
                        onChange={handleNewCollegeChange}
                        placeholder="Officer Name"
                        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                      {errors.tpoName && <p className="text-xs text-rose-600 mt-1">{errors.tpoName}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Officer Email *
                      </label>
                      <input
                        type="email"
                        name="tpoEmail"
                        value={newCollegeForm.tpoEmail}
                        onChange={handleNewCollegeChange}
                        placeholder="tpo@college.edu"
                        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                      {errors.tpoEmail && <p className="text-xs text-rose-600 mt-1">{errors.tpoEmail}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Password *
                      </label>
                      <input
                        type="password"
                        name="tpoPassword"
                        value={newCollegeForm.tpoPassword}
                        onChange={handleNewCollegeChange}
                        placeholder="Min 8 characters with letters & numbers"
                        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Must be at least 8 characters long, containing at least one letter and one number.
                      </p>
                      {errors.tpoPassword && <p className="text-xs text-rose-600 mt-1">{errors.tpoPassword}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Contact Phone *
                      </label>
                      <input
                        type="tel"
                        name="tpoPhone"
                        value={newCollegeForm.tpoPhone}
                        onChange={handleNewCollegeChange}
                        placeholder="+91-9876543210"
                        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                      {errors.tpoPhone && <p className="text-xs text-rose-600 mt-1">{errors.tpoPhone}</p>}
                    </div>
                  </div>

                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                    Notice: Newly registered colleges require platform administrator approval before TPO login access is activated.
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2.5 px-4 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/30 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>{isSubmitting ? 'Registering...' : 'Register College & TPO Account'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* 4. RECRUITER FORM                                                 */}
          {/* ================================================================= */}
          {selectedRole === 'recruiter' && (
            <div className="space-y-6">
              <div className="flex p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setRecruiterForm((prev) => ({ ...prev, companyMode: 'new' }))}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    recruiterForm.companyMode === 'new'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Register New Employer
                </button>
                <button
                  type="button"
                  onClick={() => setRecruiterForm((prev) => ({ ...prev, companyMode: 'existing' }))}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    recruiterForm.companyMode === 'existing'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Join Existing Registered Company
                </button>
              </div>

              <form onSubmit={handleRecruiterSubmit} className="space-y-4" noValidate>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Recruiter Full Name *
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={recruiterForm.name}
                      onChange={handleRecruiterChange}
                      placeholder="e.g. Elena Rostova"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    {errors.name && <p className="text-xs text-rose-600 mt-1">{errors.name}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Official Corporate Email *
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={recruiterForm.email}
                      onChange={handleRecruiterChange}
                      placeholder="recruiter@company.com"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    {errors.email && <p className="text-xs text-rose-600 mt-1">{errors.email}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Password *
                    </label>
                    <input
                      type="password"
                      name="password"
                      value={recruiterForm.password}
                      onChange={handleRecruiterChange}
                      placeholder="Min 8 characters with letters & numbers"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Must be at least 8 characters long, containing at least one letter and one number.
                    </p>
                    {errors.password && <p className="text-xs text-rose-600 mt-1">{errors.password}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={recruiterForm.phone}
                      onChange={handleRecruiterChange}
                      placeholder="+1-555-0199"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {recruiterForm.companyMode === 'new' ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                          Company Name *
                        </label>
                        <input
                          type="text"
                          name="companyName"
                          value={recruiterForm.companyName}
                          onChange={handleRecruiterChange}
                          placeholder="e.g. Nexus AI Technologies"
                          className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                        {errors.companyName && <p className="text-xs text-rose-600 mt-1">{errors.companyName}</p>}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                          Industry Sector *
                        </label>
                        <input
                          type="text"
                          name="industry"
                          value={recruiterForm.industry}
                          onChange={handleRecruiterChange}
                          placeholder="e.g. Technology & Cloud Solutions"
                          className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                        {errors.industry && <p className="text-xs text-rose-600 mt-1">{errors.industry}</p>}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Corporate Website
                      </label>
                      <input
                        type="url"
                        name="website"
                        value={recruiterForm.website}
                        onChange={handleRecruiterChange}
                        placeholder="https://company.com"
                        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Select Registered Company *
                    </label>
                    <select
                      name="companyId"
                      value={recruiterForm.companyId}
                      onChange={handleRecruiterChange}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                    >
                      {companies.map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {errors.companyId && <p className="text-xs text-rose-600 mt-1">{errors.companyId}</p>}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/30 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>{isSubmitting ? 'Registering...' : 'Register as Recruiter'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {/* ================================================================= */}
          {/* 5. ANALYST FORM                                                   */}
          {/* ================================================================= */}
          {selectedRole === 'analyst' && (
            <form onSubmit={handleAnalystSubmit} className="space-y-4" noValidate>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Analyst Full Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={analystForm.name}
                    onChange={handleAnalystChange}
                    placeholder="e.g. Dr. Shweta Rao"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  {errors.name && <p className="text-xs text-rose-600 mt-1">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Institutional Email Address *
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={analystForm.email}
                    onChange={handleAnalystChange}
                    placeholder="shweta.rao@research.org"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  {errors.email && <p className="text-xs text-rose-600 mt-1">{errors.email}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Organisation / Institution *
                  </label>
                  <input
                    type="text"
                    name="organisation"
                    value={analystForm.organisation}
                    onChange={handleAnalystChange}
                    placeholder="e.g. National Higher Education Council"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  {errors.organisation && <p className="text-xs text-rose-600 mt-1">{errors.organisation}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Organisation Type *
                  </label>
                  <select
                    name="organisationType"
                    value={analystForm.organisationType}
                    onChange={handleAnalystChange}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                  >
                    {ORGANISATION_TYPES.map((ot) => (
                      <option key={ot} value={ot}>
                        {ot}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Purpose of Requesting Access *
                </label>
                <textarea
                  name="purpose"
                  rows={2}
                  value={analystForm.purpose}
                  onChange={handleAnalystChange}
                  placeholder="e.g. Conducting comparative research on engineering graduate placement outcomes and NIRF accreditation benchmarks."
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-400 mt-0.5">
                  This explanation is reviewed by platform administrators to determine account approval.
                </p>
                {errors.purpose && <p className="text-xs text-rose-600 mt-1">{errors.purpose}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Designation / Title
                  </label>
                  <input
                    type="text"
                    name="designation"
                    value={analystForm.designation}
                    onChange={handleAnalystChange}
                    placeholder="e.g. Senior Researcher"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Password *
                  </label>
                  <input
                    type="password"
                    name="password"
                    value={analystForm.password}
                    onChange={handleAnalystChange}
                    placeholder="Min 8 characters with letters & numbers"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Must be at least 8 characters long, containing at least one letter and one number.
                  </p>
                  {errors.password && <p className="text-xs text-rose-600 mt-1">{errors.password}</p>}
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                Notice: Analyst accounts require email verification followed by superadmin authorization. You will receive an approval notification once verified.
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/30 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>{isSubmitting ? 'Submitting...' : 'Register as Observer Analyst'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* Bottom Login Link */}
          <div className="mt-6 pt-4 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-600">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-500 hover:underline">
                Sign in to your account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
