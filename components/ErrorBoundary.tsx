"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[1OS Error Boundary]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-6 rounded-[2rem] border border-white/10 bg-black/80 p-10">
          <p className="text-[0.66rem] uppercase tracking-[0.26em] text-white/46">
            Something went wrong
          </p>
          <h2 className="text-2xl font-medium tracking-[-0.04em] text-white">
            An unexpected error occurred
          </h2>
          <p className="max-w-md text-center text-sm leading-6 text-white/56">
            {this.state.error?.message ?? "The application encountered a problem. Refreshing may resolve the issue."}
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="rounded-full border border-white/14 bg-white/[0.04] px-6 py-2.5 text-[0.66rem] uppercase tracking-[0.22em] text-white/72 transition hover:border-white/22 hover:bg-white/[0.08] hover:text-white"
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
