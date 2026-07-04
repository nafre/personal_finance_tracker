"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** When set, renders a compact per-section card fallback instead of the
   *  full-page one, so one crashed section can't take down the dashboard. */
  section?: string;
}
interface State { error: Error | null; }

export class DashboardErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      if (this.props.section) {
        return (
          <div className="card flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-300">
                {this.props.section} failed to load
              </p>
              <p className="text-xs text-slate-500 truncate">{this.state.error.message}</p>
            </div>
            <button
              className="btn-ghost text-xs px-3 py-2 shrink-0"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
          </div>
        );
      }
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
          <p className="text-slate-300 text-sm font-medium">Something went wrong loading the dashboard.</p>
          <p className="text-slate-500 text-xs">{this.state.error.message}</p>
          <button
            className="btn-primary text-sm px-4 py-2"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
