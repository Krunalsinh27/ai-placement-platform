import React from 'react';
import { AlertTriangle, RotateCw, Home } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('ErrorBoundary caught an unhandled rendering error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoDashboard = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      const errorMessage =
        this.state.error?.message ||
        (typeof this.state.error === 'string' ? this.state.error : 'An unexpected error occurred while rendering this page.');

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-200/80 p-6 sm:p-8 text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-xs">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Something went wrong</h1>
              <p className="text-xs text-slate-500 mt-1">
                The application encountered an unexpected rendering error.
              </p>
            </div>

            {errorMessage && (
              <div className="p-3.5 bg-rose-50/70 border border-rose-200/80 rounded-2xl text-left max-h-40 overflow-y-auto">
                <p className="text-[11px] font-mono text-rose-800 break-words leading-relaxed font-semibold">
                  {errorMessage}
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Reload Page</span>
              </button>
              <button
                type="button"
                onClick={this.handleGoDashboard}
                className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all border border-slate-200 cursor-pointer active:scale-95"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Go to dashboard</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

