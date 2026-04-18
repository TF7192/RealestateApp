import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, UserCircle, Sun, Moon, Share2, LogOut, UserPlus, Plus, Check, Search, ArrowLeftRight, FileText } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import haptics from '../lib/haptics';
import Portal from './Portal';
import './MobileMoreSheet.css';

export default function MobileMoreSheet({ open, onClose, onOpenPalette }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
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
          </section>

          <section className="mms-section">
            <button className="mms-row" onClick={() => { haptics.tap(); toggleTheme(); }}>
              <span className="mms-row-icon">
                {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
              </span>
              <span className="mms-row-text">
                <strong>{theme === 'light' ? 'מצב כהה' : 'מצב בהיר'}</strong>
                <small>מעבר בין ערכות הצבעים</small>
              </span>
              <span className={`mms-switch ${theme === 'dark' ? 'on' : ''}`}>
                <span />
              </span>
            </button>
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
