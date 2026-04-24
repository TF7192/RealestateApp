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
  X, Sparkles, Trophy, AlertCircle,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast, optimisticUpdate } from '../lib/toast';
import { displayText } from '../lib/display';
import ConfirmDialog from '../components/ConfirmDialog';

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
      // Members come back nested inside `office.members` (the Prisma
      // include), not as a sibling `res.members`. Regressing this
      // blanks the members table — don't.
      setMembers(res?.office?.members || []);
      // Invites are OWNER-only on the server; skip the request for
      // non-OWNER sessions to avoid a noisy 403 in the network panel.
      if (user?.role === 'OWNER' && res?.office) {
        try {
          const inv = await api.listOfficeInvites();
          setInvites(inv?.items || []);
        } catch {
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

  // ─── Render states ────────────────────────────────────────────

  if (loading) {
    return (
      <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.muted, fontSize: 14 }}>
        טוען…
      </div>
    );
  }

  // No office yet — any authenticated user sees the create form
  // (the server atomically promotes the creator to OWNER).
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
              צור/י משרד
            </h1>
          </div>
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
      </div>

      {/* Invite section (OWNER-only) */}
      {isOwner && (
        <section
          aria-label="הזמנת סוכן"
          style={sectionCard({ marginBottom: 16 })}
        >
          <h3 style={sectionTitle()}>
            <UserPlus size={16} /> הזמנת סוכן
          </h3>

          {/* Mode toggle */}
          <div
            role="radiogroup"
            aria-label="סוג הזמנה"
            style={{
              display: 'inline-flex', background: DT.cream2,
              padding: 4, borderRadius: 10, gap: 4, marginBottom: 14,
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

          <form
            onSubmit={handleInvite}
            style={{
              display: 'flex', gap: 10, alignItems: 'flex-end',
              flexWrap: 'wrap',
            }}
          >
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 4,
              flex: 1, minWidth: 220,
            }}>
              <label
                htmlFor="invite-email"
                style={{
                  fontSize: 11, fontWeight: 700, color: DT.muted,
                  textTransform: 'uppercase', letterSpacing: 0.3,
                }}
              >
                {inviteMode === 'existing' ? 'אימייל הסוכן' : 'אימייל החבר החדש'}
              </label>
              <input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="agent@example.com"
                aria-label={inviteMode === 'existing' ? 'אימייל הסוכן' : 'אימייל להזמנה'}
                dir="ltr"
                required
                style={inputStyle()}
              />
            </div>
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
                      <button
                        type="button"
                        onClick={() => setPendingRemove(m)}
                        aria-label={`הסר את ${m.displayName || m.email}`}
                        style={iconBtn()}
                        title="הסר מהמשרד"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

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
                      <Copy size={14} aria-hidden="true" />
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
