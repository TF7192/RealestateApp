import { Component } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import './RootErrorBoundary.css';

// F-2.1 — Root error boundary. Catches any uncaught React render error
// so a crash in one page doesn't leave the user staring at a white
// screen. Logs to PostHog (already installed) so we see the stack in
// our analytics feed without installing Sentry today.
export default class RootErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorKey: 0 };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Best-effort analytics — PostHog is loaded on the window when
    // available; swallow all failures so the recovery UI still
    // renders even when analytics is broken.
    try {
      // eslint-disable-next-line no-console
      console.error('[RootErrorBoundary]', error, info);
      const posthog = typeof window !== 'undefined' ? window.posthog : null;
      posthog?.capture?.('frontend_exception', {
        message: error?.message,
        stack: String(error?.stack || '').slice(0, 4000),
        component_stack: String(info?.componentStack || '').slice(0, 4000),
        pathname: window?.location?.pathname,
      });
    } catch { /* ignore */ }
  }

  handleReset = () => {
    // Force a fresh render by bumping the key — gives the app one
    // shot to recover without a full reload. If the same error fires
    // again, getDerivedStateFromError flips the flag back.
    this.setState({ hasError: false, errorKey: this.state.errorKey + 1 });
  };

  handleReload = () => {
    try { window.location.reload(); } catch { /* ignore */ }
  };

  handleHome = () => {
    try { window.location.href = '/'; } catch { /* ignore */ }
  };

  render() {
    if (!this.state.hasError) {
      return <div key={this.state.errorKey}>{this.props.children}</div>;
    }
    return (
      <div className="reb-root" dir="rtl">
        <div className="reb-card">
          <div className="reb-icon"><AlertTriangle size={28} /></div>
          <h1>משהו השתבש</h1>
          <p>
            קרתה תקלה פנימית בממשק. הנתונים שלך לא נפגעו — פשוט נסה/י לרענן
            או לחזור לעמוד הבית.
          </p>
          <div className="reb-actions">
            <button className="btn btn-primary" onClick={this.handleReload}>
              <RefreshCw size={14} /> רענן את העמוד
            </button>
            <button className="btn btn-secondary" onClick={this.handleHome}>
              <Home size={14} /> חזור לדשבורד
            </button>
          </div>
          <button className="reb-retry" onClick={this.handleReset}>
            נסה שוב בלי לרענן
          </button>
        </div>
      </div>
    );
  }
}
