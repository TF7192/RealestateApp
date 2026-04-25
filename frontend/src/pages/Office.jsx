// Office (DOffice / ScreenOffice) — sprint-8.x port of the claude.ai/
// design "Estia Refined Pages" bundle. Inline Cream & Gold DT styles;
// all copy inline Hebrew, RTL.
//
// Same API surface + feature set as before (this is a layout refresh,
// not a rewrite):
//   - getOffice()                → office + nested members
//   - listOfficeInvites()        → pending (OWNER-only, 403-tolerant)
//   - createOffice()             → first-time user flow
//   - searchAgentByEmail()       → resolves an existing user to invite
//   - addOfficeMember()          → attaches an existing user
//   - createOfficeInvite()       → email-based claim-on-login invite
//   - revokeOfficeInvite() / removeOfficeMember() → housekeeping
//
// Members come back nested as `res.office.members` — the fix in 5e17b60.
// Non-OWNERs still see a read-only members list; a plain AGENT with no
// office still sees the create-office form (the server atomically
// promotes them to OWNER on first createOffice).
//
// Distinct from /team — /team = quarterly KPI scoreboard, /office =
// identity + membership admin. We cross-link to /team from the header.

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, UserPlus, Users, Mail, Crown, Trash2, Plus, Copy, Send,
  X, Sparkles, Trophy, AlertCircle, Link2, LogOut, ArrowLeftRight,
  Activity as ActivityIcon,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast, optimisticUpdate } from '../lib/toast';
import { displayText } from '../lib/display';
import ConfirmDialog from '../components/ConfirmDialog';
import Portal from '../components/Portal';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
  success: '#15803d', danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

export default function Office() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [office, setOffice] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Create-office form
  const [officeName, setOfficeName] = useState('');
  const [creating, setCreating] = useState(false);

  // Close-office popup (delete vs transfer).
  const [closeOpen, setCloseOpen] = useState(false);
  const [closing, setClosing] = useState(false);

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
      // PERF-018 — fire getOffice + listOfficeInvites in parallel for
      // OWNER. The previous implementation awaited getOffice first then
      // serially awaited invites, costing the OWNER an extra RTT. The
      // invites endpoint is OWNER-only on the server so non-OWNER
      // sessions skip the call entirely (avoids noisy 403s).
      const [officeRes, invitesRes] = await Promise.all([
        api.getOffice(),
        user?.role === 'OWNER'
          ? api.listOfficeInvites().catch(() => null)
          : Promise.resolve(null),
      ]);
      setOffice(officeRes?.office || null);
      // Members come back nested inside `office.members` (the Prisma
      // include), not as a sibling `res.members`. Regressing this
      // blanks the members table — don't.
      setMembers(officeRes?.office?.members || []);
      // If the office row is missing the invites response is moot; the
      // server would have 404'd getOffice anyway. Otherwise surface
      // whatever invitesRes returned (null = error or non-OWNER).
      if (user?.role === 'OWNER' && officeRes?.office && invitesRes) {
        setInvites(invitesRes?.items || []);
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

  const handleCreate = async (e) => {
    e?.preventDefault?.();
    const name = officeName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await api.createOffice({ name });
      toast.success('המשרד נוצר');
      setOfficeName('');
      // Server promoted us to OWNER atomically — refresh the auth
      // context so the OWNER-only sections (invites panel, close-
      // office button) surface without a page reload.
      await refresh?.();
      await load();
    } catch {
      toast.error('יצירת המשרד נכשלה');
    } finally {
      setCreating(false);
    }
  };

  const handleClose = async ({ mode, newOwnerId }) => {
    setClosing(true);
    try {
      await api.closeOffice({ mode, newOwnerId });
      toast.success(mode === 'delete' ? 'המשרד נסגר' : 'בעלות על המשרד הועברה');
      setCloseOpen(false);
      await refresh?.();
      await load();
    } catch (e) {
      toast.error(e?.message || 'סגירת המשרד נכשלה');
    } finally {
      setClosing(false);
    }
  };

  const handleInvite = async (e) => {
    e?.preventDefault?.();
    const email = inviteEmail.trim();
    if (!email) return;
    setInviting(true);
    try {
      // Both "existing" and "email" paths now funnel through the same
      // OfficeInvite record so the target always accepts explicitly —
      // no silent attachments that preserve a lingering OWNER role.
      const res = await api.createOfficeInvite({ email });
      const url = res?.invite?.inviteUrl || '';
      setLastInviteUrl(url);
      toast.success(inviteMode === 'existing'
        ? 'ההזמנה נשלחה — הסוכן/ית יראו אותה בדף "המשרד שלי"'
        : 'ההזמנה נוצרה — העתק/י את הקישור ושלח/י לסוכן');
      setInviteEmail('');
      await load();
    } catch (err) {
      if (err?.status === 409) {
        toast.error(err?.message || 'הסוכן/ית כבר חבר/ה במשרד');
      } else {
        toast.error(err?.message || 'ההזמנה נכשלה');
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

  // ─── Render states ────────────────────────────────────────────

  if (loading) {
    return (
      <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.muted, fontSize: 14 }}>
        טוען…
      </div>
    );
  }

  // No office yet — any authenticated user sees the create form
  // (the server atomically promotes the creator to OWNER). Plus any
  // pending invites addressed to this user show above the form so
  // they can join an existing office instead of creating a new one.
  if (!office) {
    return (
      <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.ink, minHeight: '100%' }}>
        <div style={{ maxWidth: 560 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            marginBottom: 8,
          }}>
            <span style={{
              background: DT.goldSoft, color: DT.goldDark,
              width: 36, height: 36, borderRadius: 10,
              display: 'grid', placeItems: 'center',
            }}>
              <Building2 size={18} aria-hidden="true" />
            </span>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.7, margin: 0 }}>
              המשרד שלי
            </h1>
          </div>

          <PendingInvitesBlock toast={toast} onAccepted={async () => {
            await refresh?.();
            await load();
          }} />

          <p style={{ fontSize: 13, color: DT.muted, margin: '0 0 20px', lineHeight: 1.7 }}>
            הקמת המשרד מאפשרת להזמין סוכנים, לעבוד יחד על נכסים ולקוחות
            ולראות דוחות צוות ברבעון. הסוכן שיוצר את המשרד הופך אוטומטית
            למנהל (OWNER).
          </p>

          <section
            aria-label="יצירת משרד"
            style={{
              background: DT.white, border: `1px solid ${DT.border}`,
              borderRadius: 14, padding: 20,
            }}
          >
            <form onSubmit={handleCreate} style={{
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label
                  htmlFor="office-name"
                  style={{
                    fontSize: 11, fontWeight: 700, color: DT.muted,
                    textTransform: 'uppercase', letterSpacing: 0.3,
                  }}
                >
                  שם המשרד
                </label>
                <input
                  id="office-name"
                  type="text"
                  value={officeName}
                  onChange={(e) => setOfficeName(e.target.value)}
                  placeholder="למשל: נדלן הגולן"
                  aria-label="שם המשרד"
                  required
                  style={inputStyle()}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  disabled={creating || !officeName.trim()}
                  style={primaryBtn(creating || !officeName.trim())}
                >
                  <Plus size={14} aria-hidden="true" />
                  {creating ? 'יוצר…' : 'צור משרד'}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    );
  }

  const pendingCount = invites.length;
  const memberCount = members.length;
  const ownerCount = members.filter((m) => m.role === 'OWNER').length;

  return (
    <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.ink, minHeight: '100%' }}>
      {/* Title row + cross-link to /team */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 16, marginBottom: 18, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.7, margin: 0 }}>
            ניהול המשרד
          </h1>
          <div style={{ fontSize: 13, color: DT.muted, marginTop: 2 }}>
            {isOwner
              ? 'הזמנת סוכנים, ניהול חברים והזמנות בהמתנה.'
              : 'צוות המשרד וחברי הצוות הפעילים.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/team" style={secondaryBtn()}>
            <Trophy size={14} /> דוח צוות
          </Link>
        </div>
      </div>

      {/* Header card — office identity + KPI strip */}
      <div style={{
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 14, padding: 20, marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 14, flexShrink: 0,
          background: `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
          color: DT.ink, display: 'grid', placeItems: 'center',
        }}>
          <Building2 size={30} aria-hidden="true" />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, margin: 0 }}>
            {displayText(office.name)}
          </h2>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            fontSize: 13, color: DT.muted, marginTop: 6, flexWrap: 'wrap',
          }}>
            <span style={chipStyle()}>
              <Users size={12} /> {memberCount} חברים
            </span>
            {ownerCount > 0 && (
              <span style={chipStyle()}>
                <Crown size={12} /> {ownerCount} מנהל/ת
              </span>
            )}
            {isOwner && pendingCount > 0 && (
              <span style={chipStyle()}>
                <Mail size={12} /> {pendingCount} בהמתנה
              </span>
            )}
          </div>
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={() => setCloseOpen(true)}
            aria-label="סגור משרד"
            style={{
              ...FONT, background: DT.white, border: `1px solid ${DT.danger}`,
              color: DT.danger, padding: '9px 14px', borderRadius: 10,
              cursor: 'pointer', fontSize: 12, fontWeight: 700,
              display: 'inline-flex', gap: 6, alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <LogOut size={14} /> סגור משרד
          </button>
        )}
      </div>

      {/* Close-office popup (OWNER-only). Two modes — transfer to
          another member or hard-delete the office row. */}
      {isOwner && closeOpen && (
        <CloseOfficeDialog
          members={members.filter((m) => m.id !== user?.id)}
          busy={closing}
          onCancel={() => setCloseOpen(false)}
          onConfirm={handleClose}
        />
      )}

      {/* Invite section (OWNER-only) */}
      {isOwner && (
        <section
          aria-label="הזמנת סוכן"
          style={sectionCard({ marginBottom: 16 })}
        >
          {/* Row 1: section title only. */}
          <h3 style={sectionTitle()}>
            <UserPlus size={16} /> הזמנת סוכן
          </h3>

          {/* Row 2: mode pill + compact email input + submit, all on a
              single baseline. Email input is constrained so the pill
              doesn't jump to its own row on common desktop widths. */}
          <form
            onSubmit={handleInvite}
            style={{
              display: 'flex', gap: 10, alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <div
              role="radiogroup"
              aria-label="סוג הזמנה"
              style={{
                display: 'inline-flex', background: DT.cream2,
                padding: 4, borderRadius: 10, gap: 4, flexShrink: 0,
              }}
            >
              <ModePill
                active={inviteMode === 'existing'}
                onClick={() => setInviteMode('existing')}
                label="קיים במערכת"
              />
              <ModePill
                active={inviteMode === 'email'}
                onClick={() => setInviteMode('email')}
                label="הזמן לפי אימייל"
              />
            </div>
            <input
              id="invite-email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder={inviteMode === 'existing' ? 'אימייל הסוכן' : 'אימייל החבר החדש'}
              aria-label={inviteMode === 'existing' ? 'אימייל הסוכן' : 'אימייל להזמנה'}
              dir="ltr"
              required
              style={{ ...inputStyle(), flex: '0 1 240px', minWidth: 160 }}
            />
            <button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              style={primaryBtn(inviting || !inviteEmail.trim())}
            >
              {inviteMode === 'existing'
                ? <Mail size={14} aria-hidden="true" />
                : <Send size={14} aria-hidden="true" />}
              {inviting ? 'מזמין…' : 'הזמן'}
            </button>
          </form>

          {/* Surface the last-created invite URL so the OWNER can copy
              it by hand (we don't ship email yet). */}
          {inviteMode === 'email' && lastInviteUrl && (
            <div
              role="group"
              aria-label="קישור ההזמנה שנוצר"
              style={{
                display: 'flex', gap: 8, marginTop: 12,
                padding: 10, background: DT.cream4,
                border: `1px solid ${DT.border}`, borderRadius: 10,
                alignItems: 'center', flexWrap: 'wrap',
              }}
            >
              <input
                type="text"
                readOnly
                value={lastInviteUrl}
                aria-label="קישור ההזמנה"
                dir="ltr"
                onFocus={(e) => e.target.select()}
                style={{
                  ...FONT,
                  flex: 1, minWidth: 200,
                  background: DT.white,
                  border: `1px solid ${DT.border}`,
                  borderRadius: 8, padding: '8px 10px',
                  fontSize: 12, color: DT.ink2,
                  fontFamily: 'monospace, Assistant',
                }}
              />
              <button
                type="button"
                onClick={() => handleCopyInvite(lastInviteUrl)}
                style={secondaryBtn()}
              >
                <Copy size={13} aria-hidden="true" />
                העתק קישור
              </button>
            </div>
          )}
        </section>
      )}

      {/* Two-col grid: members + pending invites (if OWNER). Falls
          back to a single column on narrow viewports via auto-fit. */}
      <div style={{
        display: 'grid', gap: 16,
        gridTemplateColumns: isOwner && pendingCount > 0
          ? 'repeat(auto-fit, minmax(320px, 1fr))'
          : '1fr',
      }}>
        {/* Members */}
        <section style={sectionCard()} aria-label="חברי המשרד">
          <h3 style={sectionTitle()}>
            <Users size={16} /> חברי המשרד
            <span style={{ color: DT.muted, fontWeight: 700, fontSize: 12 }}>
              · {memberCount}
            </span>
          </h3>
          {memberCount === 0 ? (
            <EmptyBlock
              icon={<Users size={24} />}
              title="אין עדיין חברים"
              body={isOwner
                ? 'הזמן/י סוכנים באמצעות הטופס שלמעלה.'
                : 'ברגע שמנהל/ת המשרד יוסיפ/ו חברים, הם יופיעו כאן.'}
            />
          ) : (
            <ul style={listReset}>
              {members.map((m) => (
                <li key={m.id}>
                  <div style={memberRow()}>
                    <MemberAvatar member={m} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: 700, fontSize: 13,
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}>
                        {displayText(m.displayName || m.email)}
                        {m.role === 'OWNER' && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            background: DT.goldSoft, color: DT.goldDark,
                            padding: '2px 7px', borderRadius: 99,
                            fontWeight: 800, fontSize: 10,
                          }}>
                            <Crown size={10} aria-hidden="true" />
                            בעלים
                          </span>
                        )}
                      </div>
                      {m.email && m.email !== m.displayName && (
                        <div style={{
                          fontSize: 11, color: DT.muted, marginTop: 2,
                          direction: 'ltr', textAlign: 'right',
                        }}>
                          {m.email}
                        </div>
                      )}
                    </div>
                    {isOwner && m.role !== 'OWNER' && (
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await optimisticUpdate(toast, {
                                label: 'מקדם…',
                                success: `${m.displayName || m.email} הפכ/ה למנהל/ת`,
                                onSave: () => api.promoteOfficeMember(m.id),
                              });
                              await load();
                            } catch { /* toast handled */ }
                          }}
                          aria-label={`מנה את ${m.displayName || m.email} למנהל`}
                          style={iconBtn()}
                          title="מנה למנהל"
                        >
                          <Crown size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingRemove(m)}
                          aria-label={`הסר את ${m.displayName || m.email}`}
                          style={iconBtn()}
                          title="הסר מהמשרד"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* AI usage (OWNER-only) — per-member monthly spend. */}
        {/* SEC-010 — admin-only observability tile, visible to any
            user with role=ADMIN on every office (was a hardcoded
            email match against talfuks1234@gmail.com). */}
        {user?.role === 'ADMIN' && <AiUsageBlock />}

        {/* Pending invites (OWNER-only) */}
        {isOwner && pendingCount > 0 && (
          <section style={sectionCard()} aria-label="הזמנות בהמתנה">
            <h3 style={sectionTitle()}>
              <Mail size={16} /> הזמנות בהמתנה
              <span style={{ color: DT.muted, fontWeight: 700, fontSize: 12 }}>
                · {pendingCount}
              </span>
            </h3>
            <ul style={listReset}>
              {invites.map((inv) => (
                <li key={inv.id}>
                  <div style={memberRow()}>
                    <span style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: DT.cream3, color: DT.goldDark,
                      display: 'grid', placeItems: 'center',
                    }}>
                      <Mail size={16} aria-hidden="true" />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: 700, fontSize: 13,
                        direction: 'ltr', textAlign: 'right',
                      }}>
                        {displayText(inv.email)}
                      </div>
                      <div style={{
                        fontSize: 11, color: DT.muted, marginTop: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        direction: 'ltr', textAlign: 'right',
                      }}
                      title={inv.inviteUrl}>
                        {displayText(inv.inviteUrl)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyInvite(inv.inviteUrl)}
                      aria-label={`העתק קישור ל-${inv.email}`}
                      style={iconBtn()}
                      title="העתק קישור"
                    >
                      <Link2 size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRevokeInvite(inv.id)}
                      aria-label={`בטל הזמנה ל-${inv.email}`}
                      style={iconBtn({ danger: true })}
                      title="בטל הזמנה"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

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

// ─── Atoms ──────────────────────────────────────────────────

function ModePill({ active, onClick, label }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      style={{
        ...FONT,
        background: active ? DT.white : 'transparent',
        color: active ? DT.ink : DT.muted,
        border: active ? `1px solid ${DT.border}` : '1px solid transparent',
        padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
        fontSize: 12, fontWeight: 700,
        boxShadow: active ? '0 1px 2px rgba(30,26,20,0.04)' : 'none',
        transition: 'background 0.15s',
      }}
    >
      {label}
    </button>
  );
}

function MemberAvatar({ member }) {
  const name = member?.displayName || member?.email || '?';
  const initial = name.charAt(0).toUpperCase();
  const isOwner = member?.role === 'OWNER';
  return (
    <div style={{
      width: 36, height: 36, borderRadius: 99, flexShrink: 0,
      background: isOwner
        ? `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`
        : `linear-gradient(160deg, ${DT.cream3}, ${DT.cream2})`,
      color: DT.ink, display: 'grid', placeItems: 'center',
      fontWeight: 800, fontSize: 15,
    }}>
      {initial}
    </div>
  );
}

function EmptyBlock({ icon, title, body }) {
  return (
    <div style={{
      padding: '28px 16px', textAlign: 'center', color: DT.muted,
    }}>
      <div style={{
        color: DT.gold, marginBottom: 8,
        display: 'inline-grid', placeItems: 'center',
      }} aria-hidden="true">
        {icon}
      </div>
      <div style={{
        fontSize: 15, fontWeight: 800, color: DT.ink, marginBottom: 4,
      }}>
        {title}
      </div>
      {body && (
        <p style={{ fontSize: 13, margin: 0, lineHeight: 1.7 }}>{body}</p>
      )}
    </div>
  );
}

// ─── Style helpers ─────────────────────────────────────────

function sectionCard(extra) {
  return {
    background: DT.white, border: `1px solid ${DT.border}`,
    borderRadius: 14, padding: 20, ...(extra || {}),
  };
}
function sectionTitle() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 14, fontWeight: 800, margin: '0 0 14px', color: DT.ink,
    letterSpacing: -0.2,
  };
}
function inputStyle() {
  return {
    ...FONT,
    background: DT.white, color: DT.ink,
    border: `1px solid ${DT.border}`, borderRadius: 10,
    padding: '10px 12px', fontSize: 14,
    outline: 'none',
  };
}
function chipStyle() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: DT.goldSoft, color: DT.goldDark,
    padding: '3px 10px', borderRadius: 99,
    fontWeight: 700, fontSize: 11,
  };
}
function primaryBtn(disabled) {
  return {
    ...FONT,
    background: disabled
      ? DT.cream3
      : `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
    border: 'none', color: DT.ink,
    padding: '10px 16px', borderRadius: 10,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13, fontWeight: 800,
    display: 'inline-flex', gap: 6, alignItems: 'center',
    boxShadow: disabled ? 'none' : '0 4px 10px rgba(180,139,76,0.3)',
    opacity: disabled ? 0.75 : 1,
  };
}
function secondaryBtn() {
  return {
    ...FONT, background: DT.white, border: `1px solid ${DT.border}`,
    padding: '9px 14px', borderRadius: 10, cursor: 'pointer',
    fontSize: 13, fontWeight: 700,
    display: 'inline-flex', gap: 6, alignItems: 'center', color: DT.ink,
    textDecoration: 'none',
  };
}
function iconBtn(opts = {}) {
  const { danger } = opts;
  return {
    ...FONT,
    background: danger ? 'rgba(185,28,28,0.06)' : DT.white,
    border: `1px solid ${danger ? 'rgba(185,28,28,0.2)' : DT.border}`,
    padding: 8, borderRadius: 10, cursor: 'pointer',
    color: danger ? DT.danger : DT.ink,
    display: 'inline-grid', placeItems: 'center',
    flexShrink: 0,
  };
}
function memberRow() {
  return {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 12px', borderRadius: 10,
    background: DT.cream4, border: `1px solid ${DT.border}`,
  };
}

const listReset = {
  listStyle: 'none', padding: 0, margin: 0,
  display: 'flex', flexDirection: 'column', gap: 6,
};

// Suppress unused-import warnings for icons reserved for near-term
// features (Sparkles on create-office illustration, AlertCircle on
// error banners — wired in when the relevant state surfaces).
void Sparkles; void AlertCircle;

// ─── AiUsageBlock (owner-only) ───────────────────────────────
// Month-to-date AI spend across the office — per-member + per-
// feature. Observability only; no quota enforcement yet.
const FEATURE_LABELS = {
  'chat': 'Estia AI (צ\'אט)',
  'voice-ingest': 'הקלטה → טופס',
  'describe-property': 'תיאור נכס AI',
  'meeting-brief': 'סיכום פגישה',
  'offer-review': 'ניתוח הצעה',
  'ai-match': 'התאמה חכמה',
};
function AiUsageBlock() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    api.officeAiUsage()
      .then((r) => { if (!cancelled) setData(r); })
      .catch(() => { if (!cancelled) setData({ members: [], features: [], totalUsd: 0, month: null }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  if (loading) return null;
  const fmtUsd = (n) => `$${(n || 0).toFixed(2)}`;
  return (
    <section style={sectionCard({ marginBottom: 16 })} aria-label="צריכת AI">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, marginBottom: 10, flexWrap: 'wrap',
      }}>
        <h3 style={{ ...sectionTitle(), margin: 0 }}>
          <ActivityIcon size={14} /> צריכת AI בחודש הנוכחי
        </h3>
        <div style={{ fontSize: 20, fontWeight: 800, color: DT.goldDark }}>
          {fmtUsd(data.totalUsd)}
        </div>
      </div>
      {data.members.length === 0 && (
        <div style={{ fontSize: 12, color: DT.muted }}>אין קריאות AI החודש.</div>
      )}
      {data.members.length > 0 && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <div style={{
              fontSize: 11, color: DT.muted, fontWeight: 700,
              letterSpacing: 0.4, marginBottom: 6,
            }}>לפי חבר/ת צוות</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
              {data.members.map((m) => (
                <li key={m.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 10, padding: '6px 10px', borderRadius: 8,
                  background: m.costUsd > 0 ? DT.cream4 : 'transparent',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: DT.ink, minWidth: 0 }}>
                    {displayText(m.displayName) || m.email}
                    {m.role === 'OWNER' && (
                      <span style={{ marginInlineStart: 6, color: DT.goldDark, fontSize: 11 }}>· מנהל/ת</span>
                    )}
                  </span>
                  <span style={{
                    display: 'inline-flex', gap: 10, alignItems: 'baseline',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    <bdi style={{ fontSize: 11, color: DT.muted }}>{m.callCount} קריאות</bdi>
                    <bdi style={{ fontSize: 13, fontWeight: 800, color: DT.ink, direction: 'ltr' }}>
                      {fmtUsd(m.costUsd)}
                    </bdi>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {data.features.map((f) => (
                <li key={f.feature} style={{
                  padding: '6px 10px', borderRadius: 99,
                  background: DT.cream3, fontSize: 12, fontWeight: 700,
                  display: 'inline-flex', gap: 6, alignItems: 'center',
                }}>
                  <span>{FEATURE_LABELS[f.feature] || f.feature}</span>
                  <bdi style={{ color: DT.goldDark, direction: 'ltr' }}>{fmtUsd(f.costUsd)}</bdi>
                  <span style={{ color: DT.muted, fontWeight: 500 }}>· {f.callCount}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── PendingInvitesBlock ─────────────────────────────────────
// Shown on the "no office" screen. Lists any OfficeInvite rows the
// server has for this user's email and lets them accept one —
// accepting flips their role in-place (AGENT) and attaches them to
// the inviting office. Quiet when empty so the create-office form
// stays the primary CTA.
function PendingInvitesBlock({ toast, onAccepted }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  useEffect(() => {
    let cancelled = false;
    api.listMyOfficeInvites()
      .then((r) => { if (!cancelled) setItems(r?.items || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  if (loading || items.length === 0) return null;
  const accept = async (invite) => {
    setBusyId(invite.id);
    try {
      await api.acceptOfficeInvite(invite.id);
      toast?.success?.(`הצטרפת ל-${invite.office?.name || 'המשרד'}`);
      await onAccepted?.();
    } catch (e) {
      toast?.error?.(e?.message || 'קבלת ההזמנה נכשלה');
    } finally {
      setBusyId(null);
    }
  };
  return (
    <section
      aria-label="הזמנות ממתינות"
      style={{
        background: DT.white, border: `1px solid ${DT.gold}`,
        borderRadius: 14, padding: 18, marginBottom: 16,
        boxShadow: '0 4px 14px rgba(180,139,76,0.15)',
      }}
    >
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        color: DT.goldDark, fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
        marginBottom: 6,
      }}>
        <Mail size={12} /> הזמנה ממתינה
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 10px', color: DT.ink }}>
        {items.length === 1
          ? 'הוזמנת למשרד'
          : `הוזמנת ל-${items.length} משרדים`}
      </h3>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((it) => (
          <li key={it.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, padding: '10px 12px', borderRadius: 10,
            background: DT.cream4, border: `1px solid ${DT.border}`,
            flexWrap: 'wrap',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: DT.ink }}>
                {displayText(it.office?.name)}
              </div>
              <div style={{ fontSize: 12, color: DT.muted, marginTop: 2 }}>
                מ-{it.invitedBy?.displayName || it.invitedBy?.email || 'מנהל המשרד'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => accept(it)}
              disabled={busyId === it.id}
              style={{
                ...FONT,
                background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
                color: DT.ink, border: 'none',
                padding: '8px 14px', borderRadius: 10,
                fontSize: 12, fontWeight: 800,
                cursor: busyId === it.id ? 'wait' : 'pointer',
                opacity: busyId === it.id ? 0.55 : 1,
                boxShadow: '0 2px 6px rgba(180,139,76,0.25)',
              }}
            >
              {busyId === it.id ? 'מצטרף…' : 'אשר/י והצטרפ/י'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── CloseOfficeDialog ───────────────────────────────────────────
// Two-mode close flow: transfer ownership to an existing member, or
// delete the office row. The parent page is already OWNER-gated.
function CloseOfficeDialog(props) {
  return <Portal><CloseOfficeDialogInner {...props} /></Portal>;
}
function CloseOfficeDialogInner({ members, busy, onCancel, onConfirm }) {
  const [mode, setMode] = useState(members.length > 0 ? 'transfer' : 'delete');
  const [newOwnerId, setNewOwnerId] = useState(members[0]?.id || '');
  const canTransfer = members.length > 0;
  const canSubmit =
    (mode === 'delete') ||
    (mode === 'transfer' && newOwnerId);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="סגירת משרד"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(30,26,20,0.6)',
        display: 'grid', placeItems: 'center', padding: 16, zIndex: 1000,
        overflowY: 'auto',
      }}
    >
      <div style={{
        ...FONT, background: DT.white, borderRadius: 16,
        maxWidth: 460, width: '100%', padding: 22,
        border: `1px solid ${DT.border}`,
        boxShadow: '0 10px 30px rgba(30,26,20,0.3)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: DT.ink }}>סגירת המשרד</h2>
          <button
            type="button"
            onClick={() => { if (!busy) onCancel(); }}
            aria-label="סגור"
            style={{
              border: 'none', background: DT.cream3, borderRadius: 9,
              width: 32, height: 32, cursor: 'pointer',
              display: 'grid', placeItems: 'center', color: DT.ink,
            }}
          ><X size={15} /></button>
        </div>
        <p style={{ fontSize: 13, color: DT.muted, lineHeight: 1.6, margin: '0 0 14px' }}>
          בחרו מה לעשות עם המשרד — להעביר את הבעלות לסוכנ/ית מהצוות או למחוק את המשרד ולפזר את החברים.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            padding: '12px 14px', borderRadius: 10,
            border: `1px solid ${mode === 'transfer' ? DT.gold : DT.border}`,
            background: mode === 'transfer' ? DT.goldSoft : DT.white,
            cursor: canTransfer ? 'pointer' : 'not-allowed',
            opacity: canTransfer ? 1 : 0.55,
          }}>
            <input
              type="radio"
              name="close-mode"
              value="transfer"
              checked={mode === 'transfer'}
              onChange={() => setMode('transfer')}
              disabled={!canTransfer}
              style={{ marginTop: 3, accentColor: DT.gold }}
            />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 13, fontWeight: 800, color: DT.ink,
              }}>
                <ArrowLeftRight size={13} /> העבר בעלות וצא
              </span>
              <span style={{ display: 'block', fontSize: 12, color: DT.muted, marginTop: 3 }}>
                המשרד נשאר פעיל — הסוכנ/ית שתבחרו תהפוך למנהל/ת.
                {!canTransfer && ' (לא נמצאו חברים נוספים להעברת הבעלות)'}
              </span>
              {mode === 'transfer' && canTransfer && (
                <select
                  value={newOwnerId}
                  onChange={(e) => setNewOwnerId(e.target.value)}
                  aria-label="בחר/י בעלים חדש"
                  style={{
                    ...FONT, marginTop: 10, width: '100%',
                    padding: '8px 10px', fontSize: 13,
                    border: `1px solid ${DT.border}`,
                    borderRadius: 9, background: DT.white, color: DT.ink,
                    outline: 'none',
                  }}
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName || m.email}
                    </option>
                  ))}
                </select>
              )}
            </span>
          </label>

          <label style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            padding: '12px 14px', borderRadius: 10,
            border: `1px solid ${mode === 'delete' ? DT.danger : DT.border}`,
            background: mode === 'delete' ? 'rgba(185,28,28,0.06)' : DT.white,
            cursor: 'pointer',
          }}>
            <input
              type="radio"
              name="close-mode"
              value="delete"
              checked={mode === 'delete'}
              onChange={() => setMode('delete')}
              style={{ marginTop: 3, accentColor: DT.danger }}
            />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 13, fontWeight: 800, color: DT.danger,
              }}>
                <Trash2 size={13} /> מחק את המשרד
              </span>
              <span style={{ display: 'block', fontSize: 12, color: DT.muted, marginTop: 3 }}>
                המשרד יימחק לצמיתות. החברים יהפכו לסוכנים עצמאיים בלי משרד.
                הנכסים והלידים שלהם לא נמחקים.
              </span>
            </span>
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              ...FONT, background: DT.white, color: DT.ink,
              border: `1px solid ${DT.border}`, padding: '9px 14px',
              borderRadius: 10, cursor: busy ? 'wait' : 'pointer',
              fontSize: 13, fontWeight: 700,
            }}
          >ביטול</button>
          <button
            type="button"
            onClick={() => onConfirm({ mode, newOwnerId: mode === 'transfer' ? newOwnerId : undefined })}
            disabled={busy || !canSubmit}
            style={{
              ...FONT,
              background: mode === 'delete' ? DT.danger : `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
              color: mode === 'delete' ? '#fff' : DT.ink,
              border: 'none', padding: '9px 14px',
              borderRadius: 10, cursor: busy ? 'wait' : 'pointer',
              fontSize: 13, fontWeight: 800,
              display: 'inline-flex', gap: 6, alignItems: 'center',
              opacity: busy || !canSubmit ? 0.55 : 1,
            }}
          >
            {mode === 'delete' ? <Trash2 size={14} /> : <ArrowLeftRight size={14} />}
            {busy ? 'פועל…' : (mode === 'delete' ? 'מחק לצמיתות' : 'העבר בעלות')}
          </button>
        </div>
      </div>
    </div>
  );
}

void LogOut;
