// Landing page for the unified ייבוא flow — Yad2 scan + Excel/CSV
// leads + Excel/CSV properties, all as clickable action cards. Sidebar
// entry lands here.
import { Link } from 'react-router-dom';
import {
  Users, Building2, Upload, ArrowLeft, Sparkles, Download as DownloadIcon,
} from 'lucide-react';
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
          <h1>ייבוא</h1>
          <span className="imp-pick-beta">בטא</span>
        </div>
        <p className="imp-pick-sub">
          שלושה מסלולים: סריקה אוטומטית של כל הנכסים שלכם ב-Yad2, ייבוא
          טבלת לידים מ-Excel/CSV, או ייבוא מלאי נכסים שלם מ-Excel/CSV.
          עד 2,000 שורות בכל פעם, תצוגה מקדימה לפני ההוספה.
        </p>
      </div>

      <div className="imp-pick-grid">
        <Link to="/integrations/yad2" className="imp-pick-card">
          <DownloadIcon size={32} aria-hidden="true" />
          <h2>ייבוא מ-Yad2</h2>
          <p>
            הדביקו קישור של דף הסוכנות שלכם ב-Yad2 — המערכת סורקת בזמן אמת
            את כל הנכסים (מכירה / השכרה / מסחרי) ומוסיפה אותם למלאי.
          </p>
          <span className="imp-pick-cta">
            <Sparkles size={14} aria-hidden="true" />
            סרוק ב-Yad2
          </span>
        </Link>

        <Link to="/import/leads" className="imp-pick-card">
          <Users size={32} aria-hidden="true" />
          <h2>ייבוא לידים מ-Excel / CSV</h2>
          <p>שמות, טלפונים, עיר ותקציב — כל הלקוחות הפוטנציאליים בקובץ.</p>
          <span className="imp-pick-cta">
            <Sparkles size={14} aria-hidden="true" />
            המשך לייבוא לידים
          </span>
        </Link>

        <Link to="/import/properties" className="imp-pick-card">
          <Building2 size={32} aria-hidden="true" />
          <h2>ייבוא נכסים מ-Excel / CSV</h2>
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
