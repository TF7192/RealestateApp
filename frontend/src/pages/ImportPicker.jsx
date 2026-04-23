// Landing page for the Excel / CSV import — the sidebar entry lands
// here so the agent picks leads vs properties before stepping into
// the shared wizard at /import/:type (Import.jsx).
import { Link } from 'react-router-dom';
import { Users, Building2, Upload, ArrowLeft, Sparkles } from 'lucide-react';
import './ImportPicker.css';

export default function ImportPicker() {
  return (
    <div className="imp-pick-page">
      <div className="imp-pick-head">
        <Link to="/dashboard" className="imp-pick-back">
          <ArrowLeft size={14} aria-hidden="true" />
          <span>חזרה ללוח בקרה</span>
        </Link>
        <div className="imp-pick-title">
          <Upload size={22} aria-hidden="true" />
          <h1>ייבוא מ-Excel / CSV</h1>
          <span className="imp-pick-beta">בטא</span>
        </div>
        <p className="imp-pick-sub">
          העלו קובץ Excel או CSV ובחרו איזו טבלה אתם מייבאים. המערכת מזהה
          את העמודות אוטומטית, מציגה תצוגה מקדימה של כל שורה, ומייבאת
          ברקע ⁠— ניתן להעלות עד 2,000 שורות בכל פעם.
        </p>
      </div>

      <div className="imp-pick-grid">
        <Link to="/import/leads" className="imp-pick-card">
          <Users size={32} aria-hidden="true" />
          <h2>ייבוא לידים</h2>
          <p>שמות, טלפונים, עיר ותקציב — כל הלקוחות הפוטנציאליים בקובץ.</p>
          <span className="imp-pick-cta">
            <Sparkles size={14} aria-hidden="true" />
            המשך לייבוא לידים
          </span>
        </Link>

        <Link to="/import/properties" className="imp-pick-card">
          <Building2 size={32} aria-hidden="true" />
          <h2>ייבוא נכסים</h2>
          <p>כתובת, חדרים, שטח ומחיר — כל מלאי הנכסים בקובץ.</p>
          <span className="imp-pick-cta">
            <Sparkles size={14} aria-hidden="true" />
            המשך לייבוא נכסים
          </span>
        </Link>
      </div>
    </div>
  );
}
