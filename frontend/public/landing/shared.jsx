/* global React */
const { useState, useEffect, useRef } = React;

// ─── Diamond logo mark (matches product's ◆ glyph) ───────────────
function LogoMark({ size = 32, tone = 'gold' }) {
  const fill = tone === 'gold'
    ? 'linear-gradient(135deg, #d9b774 0%, #8a6932 100%)'
    : 'linear-gradient(135deg, #1e1a14 0%, #3a3226 100%)';
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.22,
      background: fill,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      color: tone === 'gold' ? '#1e1a14' : '#d9b774',
      fontSize: size * 0.52, fontWeight: 700, letterSpacing: -1,
      boxShadow: tone === 'gold'
        ? '0 4px 16px rgba(180,139,76,0.35), inset 0 1px 0 rgba(255,255,255,0.3)'
        : '0 4px 16px rgba(0,0,0,0.25)',
      flexShrink: 0,
    }}>◆</div>
  );
}

// ─── Icon system (minimal inline SVGs) ────────────────────────────
const Icon = ({ name, size = 20, stroke = 1.8 }) => {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    sparkle: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    home: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
    calc: <><rect x="4" y="3" width="16" height="18" rx="2" /><line x1="8" y1="7" x2="16" y2="7" /><circle cx="8" cy="12" r=".5" fill="currentColor"/><circle cx="12" cy="12" r=".5" fill="currentColor"/><circle cx="16" cy="12" r=".5" fill="currentColor"/><circle cx="8" cy="16" r=".5" fill="currentColor"/><circle cx="12" cy="16" r=".5" fill="currentColor"/><circle cx="16" cy="16" r=".5" fill="currentColor"/></>,
    phone: <><rect x="7" y="2" width="10" height="20" rx="2" /><line x1="11" y1="18" x2="13" y2="18" /></>,
    arrow: <><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>,
    arrowL: <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>,
    check: <><polyline points="20 6 9 17 4 12" /></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
    menu: <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>,
    x: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
    dot: <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />,
    chevron: <polyline points="6 9 12 15 18 9" />,
    bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
    search: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
    trend: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></>,
    pin: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>,
    wa: <><path d="M21 12a9 9 0 1 1-4.5-7.79L21 3l-1.13 4.27A9 9 0 0 1 21 12z" /><path d="M8 10.5c0 3 2.5 5.5 5.5 5.5l1.5-1.5-2-1-1 .5a3 3 0 0 1-2-2l.5-1-1-2-1.5 1.5z" fill="currentColor" stroke="none"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>,
    star: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />,
    globe: <><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" /></>,
  };
  return <svg {...p}>{paths[name]}</svg>;
};

// ─── Live mini-dashboard (used in both hero directions) ──────────
// Simulates the Estia dashboard. Not a recreation of anyone's product —
// original layout built from the product's own vocabulary.
function LiveDashboard({ tone = 'light' }) {
  const dark = tone === 'dark';
  const [pulse, setPulse] = useState(0);
  const [activeLead, setActiveLead] = useState(0);
  const [aiText, setAiText] = useState('');
  const fullAiText = 'דירת 4 חדרים מרווחת, רחוב שקט, קרוב לפארק. מרפסת שמש, חניה, מעלית.';

  useEffect(() => {
    const t = setInterval(() => setPulse(p => p + 1), 2400);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    setActiveLead(pulse % 3);
  }, [pulse]);
  useEffect(() => {
    let i = 0;
    setAiText('');
    const t = setInterval(() => {
      i++;
      setAiText(fullAiText.slice(0, i));
      if (i >= fullAiText.length) clearInterval(t);
    }, 40);
    return () => clearInterval(t);
  }, [pulse]);

  const bg = dark ? '#1a1d28' : '#ffffff';
  const bgSub = dark ? '#141720' : '#f7f3ec';
  const bgChip = dark ? '#222636' : '#f1ebe0';
  const ink = dark ? '#f0ece4' : '#1e1a14';
  const muted = dark ? '#9a9aab' : '#6b6356';
  const gold = dark ? '#c9a96e' : '#b48b4c';
  const goldSoft = dark ? 'rgba(201,169,110,0.14)' : 'rgba(180,139,76,0.10)';
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(30,26,20,0.08)';

  const leads = [
    { name: 'דנה כהן', tag: 'חם', budget: '₪3.2M', city: 'תל אביב', tagColor: '#b91c1c' },
    { name: 'יוסי לוי', tag: 'פושר', budget: '₪2.1M', city: 'רמת גן', tagColor: '#b45309' },
    { name: 'מיכל אבן', tag: 'חם', budget: '₪4.5M', city: 'הרצליה', tagColor: '#b91c1c' },
  ];

  return (
    <div dir="rtl" style={{
      background: bgSub, borderRadius: 16, border: `1px solid ${border}`,
      padding: 14, color: ink, fontFamily: 'Assistant, Heebo, sans-serif',
      boxShadow: dark ? '0 20px 60px rgba(0,0,0,0.5)' : '0 20px 60px rgba(30,26,20,0.12)',
      overflow: 'hidden', fontSize: 13, lineHeight: 1.4,
    }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <LogoMark size={24} tone="gold" />
        <div style={{ fontWeight: 700, fontSize: 14 }}>לוח בקרה</div>
        <div style={{ marginRight: 'auto', display: 'flex', gap: 8, alignItems: 'center', color: muted }}>
          <div style={{ background: bgChip, padding: '4px 10px', borderRadius: 8, fontSize: 11, display: 'flex', gap: 6, alignItems: 'center' }}>
            <Icon name="search" size={12} /><span>חיפוש</span>
          </div>
          <div style={{ position: 'relative', color: gold }}>
            <Icon name="bell" size={16} />
            <div style={{ position: 'absolute', top: -2, right: -2, width: 7, height: 7, borderRadius: 99, background: '#b91c1c' }} />
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
        {[
          { label: 'לידים חמים', val: 12, delta: '+3', icon: 'users' },
          { label: 'נכסים פעילים', val: 34, delta: '+2', icon: 'home' },
          { label: 'פגישות היום', val: 5, delta: '', icon: 'calendar' },
          { label: 'עמלה חודשית', val: '₪84K', delta: '+12%', icon: 'trend' },
        ].map((k, i) => (
          <div key={i} style={{ background: bg, borderRadius: 10, padding: '10px 10px', border: `1px solid ${border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: gold, marginBottom: 4 }}>
              <Icon name={k.icon} size={12} />
              <div style={{ fontSize: 10, color: muted, fontWeight: 600 }}>{k.label}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: -0.4 }}>{k.val}</div>
              {k.delta && <div style={{ fontSize: 10, color: '#15803d', fontWeight: 600 }}>{k.delta}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* Body grid: leads + AI card */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 10 }}>
        {/* Leads */}
        <div style={{ background: bg, borderRadius: 10, border: `1px solid ${border}`, padding: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 12 }}>לידים פעילים</div>
            <div style={{ fontSize: 10, color: gold, fontWeight: 600 }}>הכול ←</div>
          </div>
          {leads.map((lead, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 6px',
              borderRadius: 8,
              background: activeLead === i ? goldSoft : 'transparent',
              border: activeLead === i ? `1px solid ${gold}` : '1px solid transparent',
              transition: 'all 400ms ease',
              marginBottom: 2,
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: 99,
                background: `linear-gradient(135deg, ${gold}, ${dark ? '#a08550' : '#8a6932'})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: dark ? '#1a1d28' : '#fff', fontWeight: 700, fontSize: 11,
              }}>{lead.name[0]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>{lead.name}</div>
                <div style={{ fontSize: 10, color: muted }}>{lead.city} · {lead.budget}</div>
              </div>
              <div style={{
                padding: '2px 7px', borderRadius: 99, fontSize: 9, fontWeight: 700,
                background: `${lead.tagColor}1a`, color: lead.tagColor,
              }}>{lead.tag}</div>
            </div>
          ))}
        </div>

        {/* AI card */}
        <div style={{
          background: `linear-gradient(135deg, ${goldSoft}, ${dark ? 'rgba(201,169,110,0.05)' : 'rgba(180,139,76,0.03)'})`,
          border: `1px solid ${gold}`, borderRadius: 10, padding: 10, position: 'relative',
        }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: gold, fontWeight: 700, fontSize: 11, marginBottom: 6 }}>
            <Icon name="sparkle" size={12} />
            <span>Estia AI · תיאור נכס</span>
          </div>
          <div style={{ fontSize: 11, color: ink, lineHeight: 1.5, minHeight: 56 }}>
            {aiText}<span style={{ opacity: aiText.length < fullAiText.length ? 1 : 0, color: gold }}>▍</span>
          </div>
          <div style={{
            marginTop: 6, padding: '4px 8px', borderRadius: 6,
            background: bg, border: `1px solid ${border}`,
            fontSize: 10, color: muted, display: 'flex', justifyContent: 'space-between',
          }}>
            <span>דירת 4 חד׳ · רמת גן</span><span style={{ color: gold, fontWeight: 600 }}>יצירה מחדש</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Phone screen (for iOS frame) ────────────────────────────────
function PhoneScreen({ tone = 'light' }) {
  const dark = tone === 'dark';
  const bg = dark ? '#0d0f14' : '#f7f3ec';
  const card = dark ? '#1a1d28' : '#ffffff';
  const ink = dark ? '#f0ece4' : '#1e1a14';
  const muted = dark ? '#9a9aab' : '#6b6356';
  const gold = dark ? '#c9a96e' : '#b48b4c';
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(30,26,20,0.08)';

  return (
    <div dir="rtl" style={{
      background: bg, height: '100%', fontFamily: 'Assistant, Heebo, sans-serif',
      color: ink, padding: 16, overflow: 'hidden', fontSize: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: muted }}>שלום,</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>אדם ✦</div>
        </div>
        <div style={{
          width: 38, height: 38, borderRadius: 99,
          background: `linear-gradient(135deg, ${gold}, ${dark ? '#a08550' : '#8a6932'})`,
          color: dark ? '#1a1d28' : '#fff', display: 'grid', placeItems: 'center', fontWeight: 700,
        }}>א</div>
      </div>

      <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: muted, marginBottom: 4, display: 'flex', gap: 4, alignItems: 'center' }}>
          <Icon name="sparkle" size={10} /> ליד חם התאים
        </div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>דנה כהן ← דירת 4 חד׳, רמת גן</div>
        <div style={{ fontSize: 12, color: muted, marginTop: 4 }}>התאמה 94% · תקציב ₪3.2M</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <div style={{ background: gold, color: dark ? '#1a1d28' : '#fff', padding: '7px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, flex: 1, textAlign: 'center' }}>WhatsApp</div>
          <div style={{ border: `1px solid ${border}`, padding: '7px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, flex: 1, textAlign: 'center' }}>פתיחה</div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: muted, margin: '14px 2px 8px', fontWeight: 600 }}>היום · 3 פגישות</div>
      {[
        { time: '11:00', title: 'בני – צפייה ברמת גן', place: 'ז׳בוטינסקי 8' },
        { time: '14:30', title: 'חוזה בלעדיות · משפ׳ כהן', place: 'המשרד' },
        { time: '17:00', title: 'צפייה – הרצליה פיתוח', place: 'רוקח 23' },
      ].map((m, i) => (
        <div key={i} style={{
          background: card, border: `1px solid ${border}`, borderRadius: 12,
          padding: 10, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 40, textAlign: 'center', padding: '4px 0', borderRadius: 8,
            background: dark ? 'rgba(201,169,110,0.14)' : 'rgba(180,139,76,0.10)',
            color: gold, fontWeight: 700, fontSize: 11,
          }}>{m.time}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 12 }}>{m.title}</div>
            <div style={{ fontSize: 10, color: muted }}>{m.place}</div>
          </div>
          <Icon name="arrow" size={14} />
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { LogoMark, Icon, LiveDashboard, PhoneScreen });
