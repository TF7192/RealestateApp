import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { User, UserCircle, Share2, LogOut, UserPlus, Plus, Check, Search, ArrowLeftRight, FileText, Shield, Calculator, Download as DownloadIcon, BarChart2, Activity as ActivityIcon, Bell, Tag, Building2 } from 'lucide-react';

const ADMIN_EMAILS = new Set(['talfuks1234@gmail.com']);
import { useAuth } from '../lib/auth';
import haptics from '../lib/haptics';
import Portal from './Portal';
import './MobileMoreSheet.css';

export default function MobileMoreSheet({ open, onClose, onOpenPalette }) {
  const { t } = useTranslation('nav');
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
                <strong>{user?.displayName || t('fallbacks.agent')}</strong>
                <small>{user?.agentProfile?.agency || user?.email || t('mobileMore.profileFallback')}</small>
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
              <span className="mms-row-text"><strong>{t('mobileMore.reports.title')}</strong><small>{t('mobileMore.reports.sub')}</small></span>
              <span className="mms-arrow">›</span>
            </button>
            <button className="mms-row" onClick={() => go('/activity')}>
              <span className="mms-row-icon"><ActivityIcon size={18} /></span>
              <span className="mms-row-text"><strong>{t('mobileMore.activity.title')}</strong><small>{t('mobileMore.activity.sub')}</small></span>
              <span className="mms-arrow">›</span>
            </button>
            <button className="mms-row" onClick={() => go('/reminders')}>
              <span className="mms-row-icon"><Bell size={18} /></span>
              <span className="mms-row-text"><strong>{t('mobileMore.reminders.title')}</strong><small>{t('mobileMore.reminders.sub')}</small></span>
              <span className="mms-arrow">›</span>
            </button>
            <button className="mms-row" onClick={() => go('/settings/tags')}>
              <span className="mms-row-icon"><Tag size={18} /></span>
              <span className="mms-row-text"><strong>{t('mobileMore.tagSettings.title')}</strong><small>{t('mobileMore.tagSettings.sub')}</small></span>
              <span className="mms-arrow">›</span>
            </button>
            {user?.role === 'OWNER' && (
              <button className="mms-row" onClick={() => go('/office')}>
                <span className="mms-row-icon"><Building2 size={18} /></span>
                <span className="mms-row-text"><strong>{t('mobileMore.office.title')}</strong><small>{t('mobileMore.office.sub')}</small></span>
                <span className="mms-arrow">›</span>
              </button>
            )}
          </section>

          <section className="mms-section">
            <button className="mms-row primary" onClick={copyCatalog}>
              <span className="mms-row-icon"><Share2 size={18} /></span>
              <span className="mms-row-text">
                <strong>{t('mobileMore.share.title')}</strong>
                <small>{copied ? t('mobileMore.share.copied') : t('mobileMore.share.sub')}</small>
              </span>
              <span className="mms-row-trail">
                {copied ? <Check size={16} color="var(--success)" /> : <span className="mms-arrow">›</span>}
              </span>
            </button>
            {ADMIN_EMAILS.has((user?.email || '').toLowerCase()) && (
              <>
                <button className="mms-row" onClick={() => go('/admin/chats')}>
                  <span className="mms-row-icon"><Shield size={18} /></span>
                  <span className="mms-row-text">
                    <strong>{t('mobileMore.adminChats.title')}</strong>
                    <small>{t('mobileMore.adminChats.sub')}</small>
                  </span>
                  <span className="mms-arrow">›</span>
                </button>
                <button className="mms-row" onClick={() => go('/admin/users')}>
                  <span className="mms-row-icon"><Shield size={18} /></span>
                  <span className="mms-row-text">
                    <strong>{t('mobileMore.adminUsers.title')}</strong>
                    <small>{t('mobileMore.adminUsers.sub')}</small>
                  </span>
                  <span className="mms-arrow">›</span>
                </button>
              </>
            )}
          </section>

          <section className="mms-section">
            <button className="mms-row" onClick={openPalette}>
              <span className="mms-row-icon"><Search size={18} /></span>
              <span className="mms-row-text"><strong>{t('mobileMore.search.title')}</strong><small>{t('mobileMore.search.sub')}</small></span>
              <span className="mms-arrow">›</span>
            </button>
            <button className="mms-row" onClick={() => go('/customers/new')}>
              <span className="mms-row-icon"><UserPlus size={18} /></span>
              <span className="mms-row-text"><strong>{t('mobileMore.newLead.title')}</strong><small>{t('mobileMore.newLead.sub')}</small></span>
              <span className="mms-arrow">›</span>
            </button>
            <button className="mms-row" onClick={() => go('/properties/new')}>
              <span className="mms-row-icon"><Plus size={18} /></span>
              <span className="mms-row-text"><strong>{t('mobileMore.newProperty.title')}</strong><small>{t('mobileMore.newProperty.sub')}</small></span>
              <span className="mms-arrow">›</span>
            </button>
            <button className="mms-row" onClick={() => go('/owners')}>
              <span className="mms-row-icon"><UserCircle size={18} /></span>
              <span className="mms-row-text"><strong>{t('mobileMore.owners.title')}</strong><small>{t('mobileMore.owners.sub')}</small></span>
              <span className="mms-arrow">›</span>
            </button>
            <button className="mms-row" onClick={() => go('/transfers')}>
              <span className="mms-row-icon"><ArrowLeftRight size={18} /></span>
              <span className="mms-row-text"><strong>{t('mobileMore.transfers.title')}</strong><small>{t('mobileMore.transfers.sub')}</small></span>
              <span className="mms-arrow">›</span>
            </button>
            <button className="mms-row" onClick={() => go('/templates')}>
              <span className="mms-row-icon"><FileText size={18} /></span>
              <span className="mms-row-text"><strong>{t('mobileMore.templates.title')}</strong><small>{t('mobileMore.templates.sub')}</small></span>
              <span className="mms-arrow">›</span>
            </button>
            {/* Mobile entry to the seller calculator + Yad2 importer.
                These exist on desktop in the sidebar; mobile users
                discover them via the more-sheet (this) and via the
                Dashboard quick tiles. */}
            <button className="mms-row" onClick={() => go('/calculator')}>
              <span className="mms-row-icon"><Calculator size={18} /></span>
              <span className="mms-row-text">
                <strong>{t('mobileMore.calculator.title')}</strong>
                <small>{t('mobileMore.calculator.sub')}</small>
              </span>
              <span className="mms-arrow">›</span>
            </button>
            <button className="mms-row" onClick={() => go('/integrations/yad2')}>
              <span className="mms-row-icon"><DownloadIcon size={18} /></span>
              <span className="mms-row-text">
                <strong>{t('mobileMore.yad2Import.title')}</strong>
                <small>{t('mobileMore.yad2Import.sub')}</small>
              </span>
              <span className="mms-arrow">›</span>
            </button>
          </section>

          <section className="mms-section">
            <button className="mms-row" onClick={() => go('/profile')}>
              <span className="mms-row-icon"><User size={18} /></span>
              <span className="mms-row-text"><strong>{t('mobileMore.profile.title')}</strong><small>{t('mobileMore.profile.sub')}</small></span>
              <span className="mms-arrow">›</span>
            </button>
          </section>

          <section className="mms-section danger">
            <button className="mms-row" onClick={doLogout}>
              <span className="mms-row-icon"><LogOut size={18} /></span>
              <span className="mms-row-text"><strong>{t('menu.logout')}</strong></span>
            </button>
          </section>

          <div className="mms-hint">{t('mobileMore.versionHint')}</div>
        </div>
      </div>
    </Portal>
  );
}
