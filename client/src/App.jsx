import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/layout/Layout';
import RecruiterLayout from './components/layout/RecruiterLayout';
import AnalystLayout from './components/layout/AnalystLayout';
import SuperadminLayout from './components/layout/SuperadminLayout';
import AspirantLayout from './components/layout/AspirantLayout';

// Auth Pages
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import VerifyEmail from './pages/auth/VerifyEmail';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
const PublicPlacementRecord = React.lazy(() => import('./pages/PublicPlacementRecord'));
const PublicCollegeDetail = React.lazy(() => import('./pages/PublicCollegeDetail'));

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard';
const DriveProgress = React.lazy(() => import('./pages/admin/DriveProgress'));
const ManageStudents = React.lazy(() => import('./pages/admin/ManageStudents'));
const ManageCompanies = React.lazy(() => import('./pages/admin/ManageCompanies'));
const ManageDrives = React.lazy(() => import('./pages/admin/ManageDrives'));
const ManageDriveRequests = React.lazy(() => import('./pages/admin/ManageTpoDriveRequests'));
const ManageApplications = React.lazy(() => import('./pages/admin/ManageApplications'));
const ManagePlacements = React.lazy(() => import('./pages/admin/ManagePlacements'));
const Analytics = React.lazy(() => import('./pages/admin/Analytics'));
const ManageEmailLogs = React.lazy(() => import('./pages/admin/ManageEmailLogs'));
const PlacementReport = React.lazy(() => import('./pages/admin/PlacementReport'));
const TpoAssistant = React.lazy(() => import('./pages/admin/TpoAssistant'));
const TpoResumeReviews = React.lazy(() => import('./pages/admin/TpoResumeReviews'));

// Student Pages
import StudentDashboard from './pages/student/StudentDashboard';
const EligibleDrives = React.lazy(() => import('./pages/student/EligibleDrives'));
const MyApplications = React.lazy(() => import('./pages/student/MyApplications'));
const MyTests = React.lazy(() => import('./pages/student/MyTests'));
const ResumeAi = React.lazy(() => import('./pages/student/ResumeAi'));
const MockInterview = React.lazy(() => import('./pages/student/MockInterview'));
const ResumeStudio = React.lazy(() => import('./pages/student/resume-studio/StudioDashboard'));
const StudioEditor = React.lazy(() => import('./pages/student/resume-studio/StudioEditor'));
const StudioWizard = React.lazy(() => import('./pages/student/resume-studio/StudioWizard'));
const MyPlacements = React.lazy(() => import('./pages/student/MyPlacements'));
const StudentProfile = React.lazy(() => import('./pages/student/StudentProfile'));
const StudentInterviewRoom = React.lazy(() => import('./pages/student/StudentInterviewRoom'));
const StudentAptitudeTest = React.lazy(() => import('./pages/student/StudentAptitudeTest'));

// Recruiter Pages
import RecruiterDashboard from './pages/recruiter/RecruiterDashboard';
const DrivePipeline = React.lazy(() => import('./pages/recruiter/DrivePipeline'));
const RecruiterPipelineList = React.lazy(() => import('./pages/recruiter/RecruiterPipelineList'));
const CompanyProfile = React.lazy(() => import('./pages/recruiter/CompanyProfile'));
const ManageRequirements = React.lazy(() => import('./pages/recruiter/ManageRequirements'));
const ManageRecruiterDriveRequests = React.lazy(() => import('./pages/recruiter/ManageDriveRequests'));

// Analyst Pages
const AnalystDashboard = React.lazy(() => import('./pages/analyst/AnalystDashboard'));
const AnalystColleges = React.lazy(() => import('./pages/analyst/AnalystColleges'));
const AnalystCompare = React.lazy(() => import('./pages/analyst/AnalystCompare'));
const AnalystRecruiters = React.lazy(() => import('./pages/analyst/AnalystRecruiters'));
const AnalystTrends = React.lazy(() => import('./pages/analyst/AnalystTrends'));

// Aspirant Pages
const AspirantExplore = React.lazy(() => import('./pages/aspirant/AspirantExplore'));
const AspirantShortlist = React.lazy(() => import('./pages/aspirant/AspirantShortlist'));
const AspirantCompare = React.lazy(() => import('./pages/aspirant/AspirantCompare'));
const AspirantPreferences = React.lazy(() => import('./pages/aspirant/AspirantPreferences'));

// Superadmin Pages
const SuperadminDashboard = React.lazy(() => import('./pages/superadmin/SuperadminDashboard'));
const SuperadminAnalysts = React.lazy(() => import('./pages/superadmin/SuperadminAnalysts'));
const SuperadminColleges = React.lazy(() => import('./pages/superadmin/SuperadminColleges'));
const SuperadminCompanies = React.lazy(() => import('./pages/superadmin/SuperadminCompanies'));
const SuperadminPendingAccounts = React.lazy(() => import('./pages/superadmin/SuperadminPendingAccounts'));
const AiDashboard = React.lazy(() => import('./pages/superadmin/AiDashboard'));

import NotFound from './pages/NotFound';

/**
 * Root Index Redirect based on authentication & role
 */
const RootRedirect = () => {
  const { isAuthenticated, user, loading, isAdmin, isRecruiter, isWakingUp } = useAuth();

  if (loading) {
    if (isWakingUp) {
      return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white text-center">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-6" />
          <h2 className="text-2xl font-bold tracking-tight mb-2">Server is starting, please wait...</h2>
          <p className="text-sm text-slate-400 max-w-md mb-4">
            The server is initializing services. Reconnecting automatically...
          </p>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-950/80 border border-indigo-700/50 text-xs text-indigo-300">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
            Connecting to server
          </div>
        </div>
      );
    }
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role === 'superadmin') {
    return <Navigate to="/superadmin/dashboard" replace />;
  }

  if (isAdmin) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  if (isRecruiter) {
    return <Navigate to="/recruiter/dashboard" replace />;
  }

  if (user?.role === 'analyst') {
    return <Navigate to="/analyst/dashboard" replace />;
  }

  if (user?.role === 'aspirant') {
    return <Navigate to="/aspirant/explore" replace />;
  }

  return <Navigate to="/student/dashboard" replace />;
};

const RouteSuspenseFallback = () => (
  <div className="min-h-[50vh] flex items-center justify-center p-6" role="status" aria-label="Loading page">
    <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        <ErrorBoundary>
          <React.Suspense fallback={<RouteSuspenseFallback />}>
            <Routes>
          {/* Public Routes */}
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/placements" element={<PublicPlacementRecord />} />
          <Route path="/placements/:collegeCode" element={<PublicCollegeDetail />} />

          {/* Superadmin Protected Routes */}
          <Route
            path="/superadmin"
            element={
              <ProtectedRoute allowedRoles={['superadmin']}>
                <SuperadminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/superadmin/dashboard" replace />} />
            <Route path="dashboard" element={<SuperadminDashboard />} />
            <Route path="analysts" element={<SuperadminAnalysts />} />
            <Route path="pending-accounts" element={<SuperadminPendingAccounts />} />
            <Route path="colleges" element={<SuperadminColleges />} />
            <Route path="companies" element={<SuperadminCompanies />} />
            <Route path="ai-dashboard" element={<AiDashboard />} />
            <Route path="analytics" element={<Navigate to="/superadmin/analytics/overview" replace />} />
            <Route path="analytics/overview" element={<AnalystDashboard />} />
            <Route path="analytics/colleges" element={<AnalystColleges />} />
            <Route path="analytics/compare" element={<AnalystCompare />} />
            <Route path="analytics/recruiters" element={<AnalystRecruiters />} />
            <Route path="analytics/trends" element={<AnalystTrends />} />
          </Route>

          {/* Admin Protected Routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin', 'tpo', 'superadmin']}>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="students" element={<ManageStudents />} />
            <Route path="companies" element={<ManageCompanies />} />
            <Route path="drives" element={<ManageDrives />} />
            <Route path="drives/:id/progress" element={<DriveProgress />} />
            <Route path="drive-requests" element={<ManageDriveRequests />} />
            <Route path="incoming-requests" element={<Navigate to="/admin/drive-requests" replace />} />
            <Route path="applications" element={<ManageApplications />} />
            <Route path="resumes" element={<TpoResumeReviews />} />
            <Route path="placements" element={<ManagePlacements />} />
            <Route path="reports" element={<PlacementReport />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="assistant" element={<TpoAssistant />} />
            <Route path="email-logs" element={<ManageEmailLogs />} />
          </Route>

          {/* Recruiter Protected Routes */}
          <Route
            path="/recruiter"
            element={
              <ProtectedRoute allowedRoles={['recruiter']}>
                <RecruiterLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/recruiter/dashboard" replace />} />
            <Route path="dashboard" element={<RecruiterDashboard />} />
            <Route path="pipeline" element={<RecruiterPipelineList />} />
            <Route path="drives/:id/pipeline" element={<DrivePipeline />} />
            <Route path="requirements" element={<ManageRequirements />} />
            <Route path="drive-requests" element={<ManageRecruiterDriveRequests />} />
            <Route path="assistant" element={<TpoAssistant />} />
            <Route path="profile" element={<CompanyProfile />} />
          </Route>

          {/* Analyst Protected Routes */}
          <Route
            path="/analyst"
            element={
              <ProtectedRoute allowedRoles={['analyst', 'superadmin']}>
                <AnalystLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/analyst/dashboard" replace />} />
            <Route path="dashboard" element={<AnalystDashboard />} />
            <Route path="colleges" element={<AnalystColleges />} />
            <Route path="compare" element={<AnalystCompare />} />
            <Route path="recruiters" element={<AnalystRecruiters />} />
            <Route path="trends" element={<AnalystTrends />} />
          </Route>

          {/* Student Protected Routes */}
          <Route
            path="/student"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/student/dashboard" replace />} />
            <Route path="dashboard" element={<StudentDashboard />} />
            <Route path="drives" element={<EligibleDrives />} />
            <Route path="applications" element={<MyApplications />} />
            <Route path="tests" element={<MyTests />} />
            <Route path="mock-interview" element={<MockInterview />} />
            <Route path="resume-builder/:id" element={<StudioEditor />} />
            <Route path="resume-builder/:id/wizard" element={<StudioWizard />} />
            <Route path="resume-builder" element={<Navigate to="/student/resume-studio" replace />} />
            <Route path="resume-builder/*" element={<Navigate to="/student/resume-studio" replace />} />
            <Route path="resume-studio" element={<ResumeStudio />} />
            <Route path="resume-studio/wizard" element={<StudioWizard />} />
            <Route path="resume-studio/:id" element={<StudioEditor />} />
            <Route path="resume-studio/:id/wizard" element={<StudioWizard />} />
            <Route path="assistant" element={<TpoAssistant />} />
            <Route path="resume-ai" element={<ResumeAi />} />
            <Route path="placements" element={<MyPlacements />} />
            <Route path="profile" element={<StudentProfile />} />
            <Route path="interview/:slotId" element={<StudentInterviewRoom />} />
          </Route>

          {/* Fullscreen distraction-free Student Test Route */}
          <Route
            path="/student/test/:roundId"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <StudentAptitudeTest />
              </ProtectedRoute>
            }
          />

          {/* Aspirant Protected Routes */}
          <Route
            path="/aspirant"
            element={
              <ProtectedRoute allowedRoles={['aspirant']}>
                <AspirantLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/aspirant/explore" replace />} />
            <Route path="explore" element={<AspirantExplore />} />
            <Route path="shortlist" element={<AspirantShortlist />} />
            <Route path="compare" element={<AspirantCompare />} />
            <Route path="preferences" element={<AspirantPreferences />} />
          </Route>

          {/* 404 Route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </React.Suspense>
    </ErrorBoundary>
    </AuthProvider>
  </BrowserRouter>
  );
}

export default App;
