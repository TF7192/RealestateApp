// EmailSignupBanner — soft promotion of the email-pref CTA. The
// `shouldShowEmailBanner` decision lives in ./emailBannerGate.js so
// fast-refresh can hot-reload this component cleanly.

import { Mail, X } from 'lucide-react';
import { rememberEmailBannerDismissal } from './emailBannerGate';

export default function EmailSignupBanner({ matchCount, onActivate, onDismiss }) {
  return (
    <div className="md-email-banner" role="status">
      <Mail size={18} style={{ color: 'var(--gold-readable)', flexShrink: 0 }} />
      <div className="md-email-banner-text">
        <strong>{matchCount} התאמות חדשות</strong>{' '}
        ללידים שלך. רוצה לקבל מייל בכל פעם שזה קורה? לא נשלח ספאם.
      </div>
      <button type="button" className="btn btn-primary btn-sm" onClick={onActivate}>
        הפעל התראות
      </button>
      <button
        type="button"
        className="md-icon-button"
        aria-label="הסתר הצעה"
        onClick={() => {
          rememberEmailBannerDismissal();
          onDismiss?.();
        }}
        style={{ width: 32, height: 32 }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
