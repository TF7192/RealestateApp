import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Home, Search, Building2 } from 'lucide-react';
import './NotFound.css';

// F-2.6 — Replaces the silent `<Navigate to="/" />` catch-all.
// Useful copy + primary CTA + secondary escape hatches.
export default function NotFound() {
  const loc = useLocation();
  return (
    <div className="nf-page" dir="rtl">
      <div className="nf-card">
        <div className="nf-code">404</div>
        <h1>הדף לא נמצא</h1>
        <p>
          הקישור <code dir="ltr">{loc.pathname}</code> לא קיים במערכת.
          יכול להיות שהעברתם את הקישור לפני עדכון, או שמישהו מחק את הרשומה.
        </p>
        <div className="nf-actions">
          <Link className="btn btn-primary" to="/dashboard">
            <Home size={14} /> חזור לדשבורד
          </Link>
          <Link className="btn btn-secondary" to="/properties">
            <Building2 size={14} /> לרשימת הנכסים
          </Link>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => window.history.back()}
          >
            <ArrowRight size={14} /> חזור אחורה
          </button>
        </div>
      </div>
    </div>
  );
}
