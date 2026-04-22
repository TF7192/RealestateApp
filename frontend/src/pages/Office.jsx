import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Building2,
  UserPlus,
  Users,
  Mail,
  Crown,
  Trash2,
  Plus,
  Copy,
  Send,
  X,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast, optimisticUpdate } from '../lib/toast';
import { displayText } from '../lib/display';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/ConfirmDialog';
import './Office.css';

// A1 — Office page.
//
// For users who belong to an office: show name + member list, let the
// OWNER invite new members (lookup by email → userId → addOfficeMember)
// or remove existing members with a confirmation.
//
// For users with no office: show a "create office" form (first user
// becomes OWNER automatically on the server).
//
// Non-OWNER members see a read-only members list. Non-OWNERs also
// shouldn't hit this page at all — we redirect to / if there's no
// office (i.e. an AGENT without an office doesn't get offered the
// create form). The OWNER role check reads user.role from useAuth().

export default function Office() {
  const { user } = useAuth();
  const toast = useToast();
  const [office, setOffice] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Create-office form
  const [officeName, setOfficeName] = useState('');
  const [creating, setCreating] = useState(false);

  // Invite form. `inviteMode` toggles between adding an already-
  // registered user ("existing") and sending an email-based invite
  // that claims on next login ("email").
  const [inviteMode, setInviteMode] = useState('existing');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  // Last-created invite's surrogate URL — the OWNER copies this and
  // sends it manually since we don't ship email yet.
  const [lastInviteUrl, setLastInviteUrl] = useState('');

  // Pending invites list (filtered to non-accepted on the server).
  const [invites, setInvites] = useState([]);

  // Confirm-remove dialog
  const [pendingRemove, setPendingRemove] = useState(null);

  const isOwner = user?.role === 'OWNER';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getOffice();
      setOffice(res?.office || null);
      setMembers(res?.members || []);
      // Invites are OWNER-only on the server; skip the request for
      // non-OWNER sessions to avoid a noisy 403 in the network panel.
      if (user?.role === 'OWNER' && res?.office) {
        try {
          const inv = await api.listOfficeInvites();
          setInvites(inv?.items || []);
        } catch {
          // Silent — leaves the pending-invites section empty.
          setInvites([]);
        }
      } else {
        setInvites([]);
      }
    } catch (e) {
      if (e?.status === 404) {
        setOffice(null);
        setMembers([]);
        setInvites([]);
      } else {
        toast.error('שגיאה בטעינת פרטי המשרד');
      }
    } finally {
      setLoading(false);
    }
  }, [toast, user?.role]);

  useEffect(() => { load(); }, [load]);

  // Non-owner without an office → send them home. Owners without an
  // office still see the create form.
  if (!loading && !office && !isOwner) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleCreate = async (e) => {
    e?.preventDefault?.();
    const name = officeName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await api.createOffice({ name });
      toast.success('המשרד נוצר');
      setOfficeName('');
      await load();
    } catch {
      toast.error('יצירת המשרד נכשלה');
    } finally {
      setCreating(false);
    }
  };

  const handleInvite = async (e) => {
    e?.preventDefault?.();
    const email = inviteEmail.trim();
    if (!email) return;
    setInviting(true);
    try {
      if (inviteMode === 'existing') {
        const found = await api.searchAgentByEmail(email);
        const agent = found?.agent || found?.user;
        if (!agent?.id) {
          toast.error('לא נמצא סוכן עם כתובת זו');
          return;
        }
        await api.addOfficeMember({ userId: agent.id });
        toast.success('הסוכן הוזמן למשרד');
      } else {
        // Email-invite path: server stores an OfficeInvite row and
        // returns an inviteUrl we surface for manual copy/share.
        const res = await api.createOfficeInvite({ email });
        const url = res?.invite?.inviteUrl || '';
        setLastInviteUrl(url);
        toast.success('ההזמנה נוצרה — העתק/י את הקישור ושלח/י לסוכן');
      }
      setInviteEmail('');
      await load();
    } catch (err) {
      if (err?.status === 409) {
        toast.error('הסוכן כבר חבר במשרד');
      } else {
        toast.error('ההזמנה נכשלה');
      }
    } finally {
      setInviting(false);
    }
  };

  const handleCopyInvite = async (url) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('הקישור הועתק');
    } catch {
      toast.error('לא ניתן היה להעתיק');
    }
  };

  const handleRevokeInvite = async (id) => {
    try {
      await optimisticUpdate(toast, {
        label: 'מבטל…',
        success: 'ההזמנה בוטלה',
        onSave: () => api.revokeOfficeInvite(id),
      });
      await load();
    } catch { /* toast handled */ }
  };

  const handleRemove = async () => {
    if (!pendingRemove) return;
    const id = pendingRemove.id;
    setPendingRemove(null);
    try {
      await optimisticUpdate(toast, {
        label: 'מסיר…',
        success: 'החבר הוסר מהמשרד',
        onSave: () => api.removeOfficeMember(id),
      });
      await load();
    } catch { /* toast handled */ }
  };

  if (loading) {
    return (
      <div className="office-page" dir="rtl">
        <div className="office-skel" aria-hidden />
      </div>
    );
  }

  // No office yet — owner sees the create form.
  if (!office) {
    return (
      <div className="office-page" dir="rtl">
        <header className="office-header">
          <div className="office-title">
            <Building2 size={22} aria-hidden="true" />
            <h1>משרד</h1>
          </div>
          <p className="office-subtitle">
            צור/י משרד חדש כדי להזמין סוכנים לעבודה משותפת על נכסים ולקוחות.
          </p>
        </header>
        <section className="office-card" aria-label="יצירת משרד">
          <form className="office-form" onSubmit={handleCreate}>
            <label className="office-field">
              <span>שם המשרד</span>
              <input
                type="text"
                value={officeName}
                onChange={(e) => setOfficeName(e.target.value)}
                placeholder="למשל: נדלן הגולן"
                aria-label="שם המשרד"
                required
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={creating || !officeName.trim()}
            >
              <Plus size={16} aria-hidden="true" />
              <span>{creating ? 'יוצר…' : 'צור משרד'}</span>
            </button>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div className="office-page" dir="rtl">
      <header className="office-header">
        <div className="office-title">
          <Building2 size={22} aria-hidden="true" />
          <h1>{displayText(office.name)}</h1>
        </div>
        <p className="office-subtitle">
          ניהול המשרד וצוות הסוכנים.
        </p>
      </header>

      {isOwner && (
        <section className="office-card" aria-label="הזמנת סוכן">
          <h2 className="office-card-title">
            <UserPlus size={16} aria-hidden="true" />
            <span>הזמנת סוכן</span>
          </h2>
          <div
            className="office-invite-modes"
            role="radiogroup"
            aria-label="סוג הזמנה"
          >
            <button
              type="button"
              role="radio"
              aria-checked={inviteMode === 'existing'}
              className={`btn ${inviteMode === 'existing' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setInviteMode('existing')}
            >
              קיים במערכת
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={inviteMode === 'email'}
              className={`btn ${inviteMode === 'email' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setInviteMode('email')}
            >
              הזמן לפי אימייל
            </button>
          </div>
          <form className="office-form office-form-row" onSubmit={handleInvite}>
            <label className="office-field office-field-grow">
              <span>{inviteMode === 'existing' ? 'אימייל' : 'אימייל החבר החדש'}</span>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="agent@example.com"
                aria-label={inviteMode === 'existing' ? 'אימייל הסוכן' : 'אימייל להזמנה'}
                dir="ltr"
                required
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={inviting || !inviteEmail.trim()}
            >
              {inviteMode === 'existing' ? (
                <Mail size={14} aria-hidden="true" />
              ) : (
                <Send size={14} aria-hidden="true" />
              )}
              <span>{inviting ? 'מזמין…' : 'הזמן'}</span>
            </button>
          </form>
          {inviteMode === 'email' && lastInviteUrl && (
            <div
              className="office-invite-link"
              role="group"
              aria-label="קישור ההזמנה שנוצר"
            >
              <input
                type="text"
                readOnly
                value={lastInviteUrl}
                aria-label="קישור ההזמנה"
                dir="ltr"
                onFocus={(e) => e.target.select()}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleCopyInvite(lastInviteUrl)}
              >
                <Copy size={14} aria-hidden="true" />
                <span>העתק קישור</span>
              </button>
            </div>
          )}
        </section>
      )}

      {isOwner && invites.length > 0 && (
        <section className="office-card" aria-label="הזמנות בהמתנה">
          <h2 className="office-card-title">
            <Mail size={16} aria-hidden="true" />
            <span>הזמנות בהמתנה ({invites.length})</span>
          </h2>
          <ul className="office-members">
            {invites.map((inv) => (
              <li key={inv.id} className="office-member">
                <div className="office-member-body">
                  <div className="office-member-name">
                    {displayText(inv.email)}
                  </div>
                  <div className="office-member-email">
                    {displayText(inv.inviteUrl)}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => handleCopyInvite(inv.inviteUrl)}
                  aria-label={`העתק קישור ל-${inv.email}`}
                >
                  <Copy size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost office-remove"
                  onClick={() => handleRevokeInvite(inv.id)}
                  aria-label={`בטל הזמנה ל-${inv.email}`}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="office-card" aria-label="חברי המשרד">
        <h2 className="office-card-title">
          <Users size={16} aria-hidden="true" />
          <span>חברי המשרד ({members.length})</span>
        </h2>
        {members.length === 0 ? (
          <EmptyState
            icon={<Users size={32} />}
            title="אין עדיין חברים"
            description={isOwner ? 'הזמן/י סוכנים באמצעות הטופס שלמעלה.' : ''}
          />
        ) : (
          <ul className="office-members">
            {members.map((m) => (
              <li key={m.id} className="office-member">
                <div className="office-member-body">
                  <div className="office-member-name">
                    {displayText(m.displayName || m.email)}
                    {m.role === 'OWNER' && (
                      <span className="office-member-badge" aria-label="בעלים">
                        <Crown size={12} aria-hidden="true" /> בעלים
                      </span>
                    )}
                  </div>
                  <div className="office-member-email">{displayText(m.email)}</div>
                </div>
                {isOwner && m.role !== 'OWNER' && (
                  <button
                    type="button"
                    className="btn btn-ghost office-remove"
                    onClick={() => setPendingRemove(m)}
                    aria-label={`הסר את ${m.displayName || m.email}`}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {pendingRemove && (
        <ConfirmDialog
          title="הסרת חבר"
          message={`האם להסיר את ${pendingRemove.displayName || pendingRemove.email} מהמשרד?`}
          confirmLabel="הסר"
          onConfirm={handleRemove}
          onClose={() => setPendingRemove(null)}
        />
      )}
    </div>
  );
}
