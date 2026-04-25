import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, UserCircle, Share2, LogOut, UserPlus, Plus, Check, Search, ArrowLeftRight, FileText, Shield, Calculator, Download as DownloadIcon, BarChart2, Activity as ActivityIcon, Bell, Tag, Building2 } from 'lucide-react';

// SEC-010 — admin status reads off user.role, not the email allowlist.
const isAdminUser = (u) => !!u && u.role === 'ADMIN';
import { useAuth } from '../lib/auth';
import haptics from '../lib/haptics';
import Portal from './Portal';
import './MobileMoreSheet.css';

export default function MobileMoreSheet({ open, onClose, onOpenPalette }) {
  // Inline Hebrew strings — i18n was dropped (PERF-004) since the app
  // is Hebrew-only and the English JSON locales were empty stubs.
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [copied, setCopied] = useState(false);
  const sheetRef = useRef(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);

  useEffect(() => {
    if (!open) return undefined;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Pull-down-to-dismiss gesture
  const onTouchStart = (e) => {
    startY.current = e.touches[0].clientY;
    setDragging(true);
  };
  const onTouchMove = (e) => {
    if (!dragging) return;
    const y = e.touches[0].clientY - startY.current;
    if (y > 0) setDragY(y);
  };
  const onTouchEnd = () => {
    setDragging(false);
    if (dragY > 120) {
      haptics.tap();
      onClose();
    }
    setDragY(0);
  };

  if (!open) return null;

  const catalogUrl = user?.slug
    ? `${window.location.origin}/agents/${encodeURI(user.slug)}`
    : (user?.id ? `${window.location.origin}/a/${user.id}` : null);

  const go = (to) => {
    haptics.tap();
    onClose();
    navigate(to);
  };

  const copyCatalog = async () => {
    if (!catalogUrl) return;
    await haptics.success();
    navigator.clipboard.writeText(catalogUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const doLogout = async () => {
    haptics.warning();
    onClose();
    await logout();
  };

  const openPalette = () => {
    haptics.tap();
    onClose();
    onOpenPalette?.();
  };

  return (
    <Portal>
      <div className={`mms-backdrop ${open ? 'open' : ''}`} onClick={onClose}>
        <div
          ref={sheetRef}
          className="mms-sheet"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, transition: dragging ? 'none' : undefined }}
        >
          <div className="mms-grabber" />

          <header className="mms-header">
            <div
              className="mms-me"
              onClick={() => go('/profile')}
              role="button"
            >
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="mms-avatar" />
              ) : (
                <div className="mms-avatar placeholder">{(user?.displayName || 'E').charAt(0)}</div>
              )}
              <div className="mms-me-text">
                <strong>{user?.displayName || 'סוכן'}</strong>
                <small>{user?.agentProfile?.agency || user?.email || 'עריכת פרופיל'}</small>
              </div>
              <span className="mms-chevron">›</span>
            </div>
          </header>

          {/* Sprint 4 reporting surfaces + Sprint 1 A2 tag-settings +
              Sprint 7 A1 office (OWNER-only). Desktop has these in the
              "כלי ניהול" sidebar group; on mobile they live here so the
              bottom tab bar stays at 5 slots. */}
          <section className="mms-section">
            <button className="mms-row" onClick={() => go('/reports')}>
              <span className="mms-row-icon"><BarChart2 size={18} /></span>
              <span className="mms-row-text"><strong>דוחות</strong><small>ביצועים, עסקאות, נכסים</small></span>
              <span className="mms-arrow">›</span>
            </button>
            <button className="mms-row" onClick={() => go('/activity')}>
              <span className="mms-row-icon"><ActivityIcon size={18} /></span>
              <span className="mms-row-text"><strong>פעילות</strong><small>פיד כל השינויים במערכת</small></span>
              <span className="mms-arrow">›</span>
            </button>
            <button className="mms-row" onClick={() => go('/reminders')}>
              <span className="mms-row-icon"><Bell size={18} /></span>
              <span className="mms-row-text"><strong>תזכורות</strong><small>מטלות ותזכורות עם מועד</small></span>
              <span className="mms-arrow">›</span>
            </button>
            <button className="mms-row" onClick={() => go('/settings/tags')}>
              <span className="mms-row-icon"><Tag size={18} /></span>
              <span className="mms-row-text"><strong>ניהול תגיות</strong><small>תיוג לקוחות, נכסים, עסקאות</small></span>
              <span className="mms-arrow">›</span>
            </button>
            {user?.role === 'OWNER' && (
              <button className="mms-row" onClick={() => go('/office')}>
                <span className="mms-row-icon"><Building2 size={18} /></span>
                <span className="mms-row-text"><strong>המשרד שלי</strong><small>חברי משרד ותפקידים</small></span>
                <span className="mms-arrow">›</span>
              </button>
            )}
          </section>

          <section className="mms-section">
            <button className="mms-row primary" onClick={copyCatalog}>
              <span className="mms-row-icon"><Share2 size={18} /></span>
              <span className="mms-row-text">
                <strong>שיתוף הקטלוג שלי</strong>
                <small>{copied ? 'הקישור הועתק' : 'העתק לשיתוף בוואטסאפ'}</small>
              </span>
              <span className="mms-row-trail">
                {copied ? <Check size={16} color="var(--success)" /> : <span className="mms-arrow">›</span>}
              </span>
            </button>
            {isAdminUser(user) && (
              <>
                <button className="mms-row" onClick={() => go('/admin/chats')}>
                  <span className="mms-row-icon"><Shield size={18} /></span>
                  <span className="mms-row-text">
                    <strong>מרכז שיחות</strong>
                    <small>פאנל אדמין — כל שיחות המשתמשים</small>
                  </span>
                  <span className="mms-arrow">›</span>
                </button>
                <button className="mms-row" onClick={() => go('/admin/users')}>
                  <span className="mms-row-icon"><Shield size={18} /></span>
                  <span className="mms-row-text">
                    <strong>משתמשים</strong>
                    <small>פאנל אדמין — כל המשתמשים, נכסים, לידים</small>
                  </span>
                  <span className="mms-arrow">›</span>
                </button>
              </>
            )}
          </section>

          <section className="mms-section">
            <button className="mms-row" onClick={openPalette}>
              <span className="mms-row-icon"><Search size={18} /></span>
              <span className="mms-row-text"><strong>חיפוש מהיר</strong><small>לקוחות, נכסים, מסכים</small></span>
              <span className="mms-arrow">›</span>
            </button>
            <button className="mms-row" onClick={() => go('/customers/new')}>
              <span className="mms-row-icon"><UserPlus size={18} /></span>
              <span className="mms-row-text"><strong>ליד חדש</strong><small>הוספת לקוח פוטנציאלי</small></span>
              <span className="mms-arrow">›</span>
            </button>
            <button className="mms-row" onClick={() => go('/properties/new')}>
              <span className="mms-row-icon"><Plus size={18} /></span>
              <span className="mms-row-text"><strong>קליטת נכס</strong><small>הוספת נכס למערכת</small></span>
              <span className="mms-arrow">›</span>
            </button>
            <button className="mms-row" onClick={() => go('/owners')}>
              <span className="mms-row-icon"><UserCircle size={18} /></span>
              <span className="mms-row-text"><strong>בעלי נכסים</strong><small>ניהול בעלי הנכסים שלך</small></span>
              <span className="mms-arrow">›</span>
            </button>
            <button className="mms-row" onClick={() => go('/transfers')}>
              <span className="mms-row-icon"><ArrowLeftRight size={18} /></span>
              <span className="mms-row-text"><strong>העברות נכסים</strong><small>בקשות נכנסות ויוצאות</small></span>
              <span className="mms-arrow">›</span>
            </button>
            <button className="mms-row" onClick={() => go('/templates')}>
              <span className="mms-row-icon"><FileText size={18} /></span>
              <span className="mms-row-text"><strong>תבניות הודעה</strong><small>וואטסאפ אוטומטי מפרטי הנכס</small></span>
              <span className="mms-arrow">›</span>
            </button>
            {/* Mobile entry to the seller calculator + Yad2 importer.
                These exist on desktop in the sidebar; mobile users
                discover them via the more-sheet (this) and via the
                Dashboard quick tiles. */}
            <button className="mms-row" onClick={() => go('/calculator')}>
              <span className="mms-row-icon"><Calculator size={18} /></span>
              <span className="mms-row-text">
                <strong>מחשבון</strong>
                <small>חישוב נטו למוכר אחרי עמלות ומע״מ</small>
              </span>
              <span className="mms-arrow">›</span>
            </button>
            <button className="mms-row" onClick={() => go('/integrations/yad2')}>
              <span className="mms-row-icon"><DownloadIcon size={18} /></span>
              <span className="mms-row-text">
                <strong>ייבוא נכסים מ-Yad2</strong>
                <small>סריקת מודעות הסוכנות + תמונות בלחיצה</small>
              </span>
              <span className="mms-arrow">›</span>
            </button>
          </section>

          <section className="mms-section">
            <button className="mms-row" onClick={() => go('/profile')}>
              <span className="mms-row-icon"><User size={18} /></span>
              <span className="mms-row-text"><strong>הפרופיל שלי</strong><small>פרטים, תמונה, ביוגרפיה</small></span>
              <span className="mms-arrow">›</span>
            </button>
          </section>

          <section className="mms-section danger">
            <button className="mms-row" onClick={doLogout}>
              <span className="mms-row-icon"><LogOut size={18} /></span>
              <span className="mms-row-text"><strong>יציאה</strong></span>
            </button>
          </section>

          <div className="mms-hint">Estia · גרסה לאייפון</div>
        </div>
      </div>
    </Portal>
  );
}
