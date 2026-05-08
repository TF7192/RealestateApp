// Phase 3 — opt-in notification preferences.
//
// /settings/notifications — toggles for in-app / email / SMS delivery
// of market-listing matches, plus a min-score slider that gates
// email/SMS to high-confidence matches only.

import { useEffect, useState } from 'react';
import { Bell, Mail, Phone, Sparkles, Save } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', white: '#fff',
  ink: '#1e1a14', muted: '#6b6356',
  gold: '#b48b4c', goldDark: '#7a5c2c', goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
  success: '#15803d',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

export default function SettingsNotifications() {
  const [pref, setPref] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    api.getNotificationPreferences().then(
      (res) => { if (!cancelled) { setPref(res); setLoading(false); } },
      (err) => { if (!cancelled) { toast.error?.(err?.message || 'טעינה נכשלה'); setLoading(false); } },
    );
    return () => { cancelled = true; };
  }, [toast]);

  const update = (k, v) => setPref((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!pref) return;
    setSaving(true);
    try {
      const next = await api.updateNotificationPreferences({
        marketMatchInAppEnabled:          pref.marketMatchInAppEnabled,
        marketMatchEmailEnabled:          pref.marketMatchEmailEnabled,
        marketMatchSmsEnabled:            pref.marketMatchSmsEnabled,
        minMatchScoreForExternalDelivery: pref.minMatchScoreForExternalDelivery,
      });
      setPref(next);
      toast.success?.('ההעדפות נשמרו');
    } catch (err) {
      toast.error?.(err?.message || 'שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !pref) {
    return (
      <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.ink }}>
        <div style={{ color: DT.muted }}>טוען…</div>
      </div>
    );
  }

  return (
    <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.ink, maxWidth: 720 }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.7, margin: 0 }}>
          התראות
        </h1>
        <div style={{ fontSize: 13, color: DT.muted, marginTop: 4 }}>
          בחר/י איך לקבל התראות על נכסים חדשים שתואמים למתעניין שלך.
        </div>
      </div>

      <div style={{
        background: DT.white, border: `1px solid ${DT.border}`, borderRadius: 14,
        padding: 14,
      }}>
        <SectionHeader
          icon={<Sparkles size={16} />}
          title="התאמות מודעות חדשות בשוק"
          sub="התראות על נכסים שמתאימים לדרישות של ליד פעיל"
        />

        <ToggleRow
          icon={<Bell size={16} />}
          label="התראה באפליקציה"
          help="פעמון בתוך האפליקציה. מומלץ — הפעלה כברירת מחדל."
          checked={pref.marketMatchInAppEnabled}
          onChange={(v) => update('marketMatchInAppEnabled', v)}
        />

        <ToggleRow
          icon={<Mail size={16} />}
          label="התראה במייל"
          help="כשמופיע נכס בדירוג גבוה. ברירת מחדל: כבוי."
          checked={pref.marketMatchEmailEnabled}
          onChange={(v) => update('marketMatchEmailEnabled', v)}
        />

        <ToggleRow
          icon={<Phone size={16} />}
          label="התראה ב-SMS"
          help="עדיין בפיתוח — נשלח רק כשנחבר ספק SMS. ההגדרה תישמר ותתעורר אוטומטית."
          checked={pref.marketMatchSmsEnabled}
          onChange={(v) => update('marketMatchSmsEnabled', v)}
          disabled
        />

        <div style={{
          padding: '14px 0', borderTop: `1px solid ${DT.border}`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
            סף ציון מינימלי למייל / SMS
          </div>
          <div style={{ fontSize: 12, color: DT.muted, marginBottom: 10 }}>
            רק התאמות בציון של {pref.minMatchScoreForExternalDelivery}+ ייצרו מייל / SMS.
            התראות באפליקציה מקבלות כל התאמה מעל סף הציון של ה-CRM (70).
          </div>
          <input
            type="range"
            min={0} max={100} step={5}
            value={pref.minMatchScoreForExternalDelivery}
            onChange={(e) => update('minMatchScoreForExternalDelivery', Number.parseInt(e.target.value, 10))}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: DT.muted, marginTop: 4 }}>
            <span>0</span><span>50</span><span>100</span>
          </div>
        </div>

        <div style={{
          display: 'flex', justifyContent: 'flex-end',
          paddingTop: 12, borderTop: `1px solid ${DT.border}`, marginTop: 4,
        }}>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              ...FONT, cursor: saving ? 'not-allowed' : 'pointer',
              background: `linear-gradient(135deg, ${DT.gold}, ${DT.goldDark})`,
              color: DT.ink, border: 'none',
              padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 800,
              display: 'inline-flex', gap: 6, alignItems: 'center',
              minHeight: 44, opacity: saving ? 0.7 : 1,
            }}
          >
            <Save size={14} /> שמור
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, sub }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, background: DT.goldSoft,
        display: 'grid', placeItems: 'center', color: DT.gold, flexShrink: 0,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 12, color: DT.muted }}>{sub}</div>
      </div>
    </div>
  );
}

function ToggleRow({ icon, label, help, checked, onChange, disabled }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '12px 0', borderTop: `1px solid ${DT.border}`,
      opacity: disabled ? 0.6 : 1,
    }}>
      <div style={{ color: DT.muted, marginTop: 2, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 12, color: DT.muted, marginTop: 2 }}>{help}</div>
      </div>
      <label style={{
        display: 'inline-flex', alignItems: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        flexShrink: 0,
      }}>
        <input
          type="checkbox"
          checked={!!checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={label}
          style={{ width: 22, height: 22, cursor: disabled ? 'not-allowed' : 'pointer' }}
        />
      </label>
    </div>
  );
}
