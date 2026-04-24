/* global React, Icon, LogoMark, LiveDashboard, PhoneScreen, IOSDevice */
const { useState, useEffect } = React;

// Direction A · "Cream & Gold" — warm editorial B2B. All-light palette.
function DirectionA({ copy }) {
  const [cycle, setCycle] = useState('yearly');
  const [openFaq, setOpenFaq] = useState(0);

  // Light palette only
  const ink = '#1e1a14';
  const ink2 = '#2d261d';
  const cream = '#f7f3ec';
  const cream2 = '#efe9df';
  const cream3 = '#e8dfcf';        // stronger warm surface for contrast
  const cream4 = '#fbf7f0';        // near-white card
  const gold = '#b48b4c';
  const goldLight = '#d9b774';
  const goldDark = '#7a5c2c';
  const muted = '#6b6356';
  const border = 'rgba(30,26,20,0.08)';
  const borderStrong = 'rgba(30,26,20,0.14)';

  const btnPri = {
    background: `linear-gradient(180deg, #d9b774 0%, #b48b4c 100%)`,
    color: '#1e1a14', fontWeight: 700, padding: '14px 22px',
    borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 15,
    boxShadow: '0 8px 24px rgba(180,139,76,0.28), inset 0 1px 0 rgba(255,255,255,0.35)',
    display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'inherit',
  };
  const btnSec = {
    background: '#fff', color: ink, fontWeight: 600, padding: '14px 18px',
    borderRadius: 12, border: `1px solid ${borderStrong}`, cursor: 'pointer', fontSize: 15,
    display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'inherit',
  };

  return (
    <div dir="rtl" style={{
      background: cream, color: ink, fontFamily: 'Assistant, Heebo, sans-serif',
      minHeight: '100%', lineHeight: 1.55,
    }}>
      {/* NAV */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50, background: 'rgba(247,243,236,0.85)',
        backdropFilter: 'blur(12px)', borderBottom: `1px solid ${border}`,
      }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '14px 40px', display: 'flex', alignItems: 'center', gap: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <LogoMark size={32} tone="gold" />
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Estia</span>
          </div>
          <nav style={{ display: 'flex', gap: 24, marginRight: 20 }}>
            {copy.nav.links.map(l => (
              <a key={l.id} href={`#${l.id}`} style={{ color: muted, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>{l.label}</a>
            ))}
          </nav>
          <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <a href="#" style={{ color: ink, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>{copy.nav.login_cta}</a>
            <button style={btnPri}>{copy.nav.primary_cta}<Icon name="arrow" size={16} /></button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section style={{ padding: '72px 40px 40px', maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
        <div style={{
          position: 'absolute', top: -120, left: -120, width: 600, height: 600, pointerEvents: 'none',
          background: 'radial-gradient(circle at 30% 30%, rgba(180,139,76,0.18), transparent 60%)',
        }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 48, alignItems: 'center', position: 'relative' }}>
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px',
              background: 'rgba(180,139,76,0.12)', border: `1px solid rgba(180,139,76,0.22)`,
              borderRadius: 99, fontSize: 13, color: goldDark, fontWeight: 600, marginBottom: 20,
            }}>
              <Icon name="sparkle" size={13} />
              {copy.hero.eyebrow}
            </div>
            <h1 style={{
              fontSize: 68, lineHeight: 1.02, letterSpacing: -2.5, fontWeight: 800,
              marginBottom: 20, textWrap: 'balance',
            }}>
              {copy.hero.h1_line_1}<br/>
              <span style={{
                background: `linear-gradient(135deg, ${gold}, ${goldLight})`,
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>{copy.hero.h1_line_2}</span>
            </h1>
            <p style={{ fontSize: 19, color: muted, maxWidth: 540, marginBottom: 28, textWrap: 'pretty' }}>
              {copy.hero.sub}
            </p>
            <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
              <button style={btnPri}>{copy.hero.primary_cta}<Icon name="arrow" size={16} /></button>
              <button style={btnSec}>{copy.hero.secondary_cta}</button>
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              {copy.hero.trust.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', color: muted, fontSize: 13, fontWeight: 500 }}>
                  <div style={{ width: 16, height: 16, borderRadius: 99, background: 'rgba(21,128,61,0.15)', color: '#15803d', display: 'grid', placeItems: 'center' }}>
                    <Icon name="check" size={10} stroke={3} />
                  </div>
                  {t}
                </div>
              ))}
            </div>
          </div>

          {/* Hero visual */}
          <div style={{ position: 'relative', minHeight: 520 }}>
            <div style={{
              position: 'absolute', inset: 0, transform: 'rotate(-1.5deg)',
              background: '#ffffff', borderRadius: 24, padding: 16,
              boxShadow: '0 30px 80px rgba(30,26,20,0.18), 0 10px 30px rgba(30,26,20,0.08)',
              border: `1px solid ${border}`,
            }}>
              <div style={{ height: 22, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10, paddingRight: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 99, background: '#e8806f' }} />
                <div style={{ width: 10, height: 10, borderRadius: 99, background: '#ebc25d' }} />
                <div style={{ width: 10, height: 10, borderRadius: 99, background: '#72bf6b' }} />
                <div style={{
                  marginRight: 'auto', fontSize: 11, color: muted, fontFamily: 'ui-monospace,monospace',
                  background: cream, padding: '3px 10px', borderRadius: 6,
                }}>app.estia.co.il/dashboard</div>
              </div>
              <LiveDashboard tone="light" />
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES — warm cream panel */}
      <section id="features" style={{ padding: '80px 40px', background: cream2, borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}` }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ maxWidth: 720, marginBottom: 48 }}>
            <div style={{ color: goldDark, fontWeight: 700, fontSize: 13, marginBottom: 10, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              {copy.features.section_eyebrow}
            </div>
            <h2 style={{ fontSize: 48, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.05, marginBottom: 14 }}>
              {copy.features.section_title}
            </h2>
            <p style={{ fontSize: 17, color: muted, maxWidth: 620 }}>{copy.features.section_sub}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {copy.features.cards.map((c, i) => {
              const iconName = { ai: 'sparkle', leads: 'users', properties: 'home', calendar: 'calendar', calculator: 'calc', mobile: 'phone' }[c.key];
              const featured = c.key === 'ai';
              return (
                <div key={c.key} style={{
                  background: featured
                    ? `linear-gradient(160deg, ${cream4} 0%, ${cream3} 100%)`
                    : '#fff',
                  color: ink,
                  border: featured ? `1px solid ${gold}` : `1px solid ${border}`,
                  borderRadius: 20, padding: 28, position: 'relative', overflow: 'hidden',
                  boxShadow: featured ? `0 20px 50px rgba(180,139,76,0.18)` : '0 1px 2px rgba(30,26,20,0.04)',
                }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, marginBottom: 18,
                    display: 'grid', placeItems: 'center',
                    background: 'rgba(180,139,76,0.14)', color: gold,
                  }}>
                    <Icon name={iconName} size={22} />
                  </div>
                  <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.5, marginBottom: 8 }}>{c.title}</div>
                  <div style={{ fontSize: 14.5, color: muted, lineHeight: 1.55 }}>{c.body}</div>
                  {featured && (
                    <div style={{
                      position: 'absolute', top: 18, left: 18, fontSize: 11, fontWeight: 800,
                      padding: '5px 11px', borderRadius: 99, color: ink, letterSpacing: 0.4,
                      background: `linear-gradient(180deg, ${goldLight}, ${gold})`,
                      boxShadow: '0 4px 10px rgba(180,139,76,0.35)',
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                    }}>
                      ✦ PREMIUM
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* AI SPOTLIGHT — now light too */}
      <section id="ai" style={{ padding: '96px 40px', maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
        {/* Premium ribbon banner above section */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px',
          background: `linear-gradient(180deg, ${goldLight}, ${gold})`, color: ink,
          borderRadius: 99, fontSize: 13, fontWeight: 800, letterSpacing: 0.5,
          boxShadow: '0 10px 26px rgba(180,139,76,0.35)', marginBottom: 16,
        }}>
          <Icon name="star" size={14} />PREMIUM ONLY · ✦
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
          <div>
            <div style={{
              display: 'inline-flex', gap: 8, alignItems: 'center', color: goldDark,
              fontSize: 13, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 14,
            }}>
              <Icon name="sparkle" size={14} />
              {copy.ai.eyebrow}
            </div>
            <h2 style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1.4, lineHeight: 1.1, marginBottom: 16 }}>
              {copy.ai.title}
            </h2>
            <p style={{ fontSize: 17, color: muted, marginBottom: 20 }}>{copy.ai.sub}</p>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              background: '#fff', border: `1px dashed ${gold}`, borderRadius: 12,
              fontSize: 13, color: goldDark, fontWeight: 600, marginBottom: 22,
            }}>
              <Icon name="shield" size={15} />
              כלול רק במסלול Premium
            </div>
            {copy.ai.actions.map((a, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px',
                background: '#fff', border: `1px solid ${border}`, borderRadius: 14,
                marginBottom: 10,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, background: 'rgba(180,139,76,0.12)',
                  color: gold, display: 'grid', placeItems: 'center',
                }}><Icon name="sparkle" size={16} /></div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{a.label}</div>
                <div style={{
                  marginRight: 'auto', fontSize: 10, color: ink, fontWeight: 800,
                  padding: '3px 8px', borderRadius: 99,
                  background: `linear-gradient(180deg, ${goldLight}, ${gold})`,
                  letterSpacing: 0.4,
                }}>PRO</div>
              </div>
            ))}
          </div>
          <div style={{
            background: cream4, borderRadius: 24, padding: 28, color: ink, position: 'relative',
            boxShadow: '0 30px 80px rgba(30,26,20,0.10), 0 0 0 6px rgba(180,139,76,0.08)',
            border: `2px solid ${gold}`,
            minHeight: 440,
          }}>
            {/* Corner premium ribbon */}
            <div style={{
              position: 'absolute', top: -14, right: 24, zIndex: 2,
              background: `linear-gradient(180deg, ${goldLight}, ${gold})`,
              color: ink, padding: '6px 14px', borderRadius: 99,
              fontSize: 12, fontWeight: 800, letterSpacing: 0.5,
              boxShadow: '0 6px 16px rgba(180,139,76,0.4)',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <Icon name="star" size={12} />PREMIUM
            </div>
            <AIPlaygroundLight ink={ink} muted={muted} gold={gold} goldDark={goldDark} cream={cream} cream2={cream2} border={border} />
          </div>
        </div>
      </section>

      {/* MOBILE SECTION — cream not dark */}
      <section id="mobile" style={{ padding: '96px 40px', background: cream3, borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}` }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, position: 'relative' }}>
            <div style={{ transform: 'rotate(-4deg) translateY(20px)' }}>
              <IOSDevice width={260}>
                <PhoneScreen tone="light" />
              </IOSDevice>
            </div>
            <div style={{ transform: 'rotate(3deg) translateY(-20px)' }}>
              <IOSDevice width={260}>
                <PhoneScreen tone="light" />
              </IOSDevice>
            </div>
          </div>
          <div>
            <div style={{ color: goldDark, fontWeight: 700, fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 }}>
              {copy.mobile.section_eyebrow}
            </div>
            <h2 style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1.4, lineHeight: 1.08, marginBottom: 14 }}>
              {copy.mobile.section_title}
            </h2>
            <p style={{ fontSize: 17, color: muted, marginBottom: 24 }}>{copy.mobile.section_sub}</p>
            {copy.mobile.bullets.map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'start' }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 99, background: 'rgba(180,139,76,0.14)',
                  color: goldDark, display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 2,
                }}><Icon name="check" size={12} stroke={3} /></div>
                <div style={{ fontSize: 15.5 }}>{b}</div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <StoreBadge kind="apple" />
              <StoreBadge kind="google" />
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: muted }}>{copy.hero.store_disabled_note}</div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ padding: '96px 40px', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 56px' }}>
          <h2 style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1.4, lineHeight: 1.08, marginBottom: 10 }}>{copy.how.section_title}</h2>
          <p style={{ fontSize: 17, color: muted }}>{copy.how.section_sub}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, position: 'relative' }}>
          {copy.how.steps.map((s, i) => (
            <div key={i} style={{
              background: '#fff', border: `1px solid ${border}`, borderRadius: 20, padding: 28, position: 'relative',
            }}>
              <div style={{
                fontSize: 56, fontWeight: 800, lineHeight: 1, color: 'rgba(180,139,76,0.25)',
                fontFamily: 'ui-monospace, monospace', marginBottom: 16, letterSpacing: -2,
              }}>0{s.n}</div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5, marginBottom: 8 }}>{s.title}</div>
              <div style={{ fontSize: 14.5, color: muted }}>{s.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING — fully light */}
      <section id="pricing" style={{ padding: '96px 40px', background: cream2 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ color: goldDark, fontWeight: 700, fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>{copy.pricing.section_eyebrow}</div>
            <h2 style={{ fontSize: 48, fontWeight: 800, letterSpacing: -1.5, marginBottom: 12 }}>{copy.pricing.section_title}</h2>
            <p style={{ fontSize: 17, color: muted, marginBottom: 24 }}>{copy.pricing.section_sub}</p>

            <div style={{
              display: 'inline-flex', background: '#fff', borderRadius: 99, padding: 4,
              border: `1px solid ${border}`, gap: 2,
            }}>
              {['monthly', 'yearly'].map(c => (
                <button key={c} onClick={() => setCycle(c)} style={{
                  padding: '9px 20px', borderRadius: 99, border: 'none', cursor: 'pointer',
                  background: cycle === c ? gold : 'transparent',
                  color: cycle === c ? '#fff' : ink, fontWeight: 600, fontSize: 14, fontFamily: 'inherit',
                  transition: 'all 200ms',
                }}>{c === 'monthly' ? copy.pricing.cycle_monthly : copy.pricing.cycle_yearly}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
            {copy.pricing.tiers.map(t => {
              const featured = t.recommended;
              const price = cycle === 'monthly' ? t.monthly : Math.round(t.yearly / 12);
              return (
                <div key={t.key} style={{
                  background: featured ? `linear-gradient(160deg, ${cream4} 0%, ${cream3} 100%)` : '#fff',
                  color: ink,
                  border: featured ? `2px solid ${gold}` : `1px solid ${border}`,
                  borderRadius: 24, padding: 32, position: 'relative',
                  boxShadow: featured ? '0 30px 80px rgba(180,139,76,0.22)' : 'none',
                  transform: featured ? 'scale(1.02)' : 'none',
                }}>
                  {featured && (
                    <div style={{
                      position: 'absolute', top: -14, right: 24,
                      background: `linear-gradient(180deg, ${goldLight}, ${gold})`,
                      color: ink, padding: '5px 14px', borderRadius: 99,
                      fontSize: 12, fontWeight: 700, boxShadow: '0 4px 12px rgba(180,139,76,0.3)',
                    }}>{t.recommended_badge}</div>
                  )}
                  <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 2 }}>{t.name}</div>
                  <div style={{ fontSize: 13, color: muted, marginBottom: 20 }}>{t.lead}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                    <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: -2, color: featured ? goldDark : ink }}>{copy.pricing.currency}{price}</div>
                    <div style={{ fontSize: 14, color: muted }}>/ חודש</div>
                  </div>
                  <div style={{ fontSize: 12, color: muted, marginBottom: 22 }}>{copy.pricing.vat_note} {cycle === 'yearly' && '· חודשיים מתנה'}</div>
                  <button style={{
                    width: '100%',
                    background: featured ? `linear-gradient(180deg, ${goldLight}, ${gold})` : '#fff',
                    color: ink,
                    fontWeight: 700, padding: '13px', borderRadius: 12,
                    border: featured ? 'none' : `1px solid ${borderStrong}`, cursor: 'pointer',
                    fontSize: 15, fontFamily: 'inherit', marginBottom: 20,
                    boxShadow: featured ? '0 8px 20px rgba(180,139,76,0.28)' : 'none',
                  }}>{t.cta}</button>
                  <div style={{ borderTop: `1px solid ${border}`, paddingTop: 18 }}>
                    {t.bullets.map((b, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'start', marginBottom: 10, fontSize: 14 }}>
                        <span style={{ color: gold, flexShrink: 0, marginTop: 2 }}><Icon name="check" size={14} stroke={3} /></span>
                        <span>{b}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 22, marginTop: 26, flexWrap: 'wrap' }}>
            {copy.pricing.trust.map((t, i) => (
              <div key={i} style={{ fontSize: 13, color: muted, display: 'flex', gap: 6, alignItems: 'center' }}>
                <Icon name="check" size={12} stroke={3} />{t}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{ padding: '96px 40px', maxWidth: 880, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ color: goldDark, fontWeight: 700, fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>{copy.faq.section_eyebrow}</div>
          <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1.3 }}>{copy.faq.section_title}</h2>
        </div>
        {copy.faq.items.map((f, i) => (
          <div key={i} onClick={() => setOpenFaq(openFaq === i ? -1 : i)} style={{
            borderBottom: `1px solid ${border}`, padding: '20px 4px', cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
              <div style={{ fontSize: 17, fontWeight: 600 }}>{f.q}</div>
              <div style={{ color: gold, transform: openFaq === i ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}>
                <Icon name="chevron" size={18} />
              </div>
            </div>
            {openFaq === i && <div style={{ marginTop: 12, fontSize: 15, color: muted, maxWidth: 720 }}>{f.a}</div>}
          </div>
        ))}
      </section>

      {/* FINAL CTA — gold, not dark */}
      <section style={{ padding: '96px 40px', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{
          background: `linear-gradient(135deg, ${goldLight} 0%, ${gold} 60%, ${goldDark} 100%)`,
          borderRadius: 32, padding: '72px 48px', color: ink, textAlign: 'center',
          position: 'relative', overflow: 'hidden',
          boxShadow: '0 40px 100px -20px rgba(180,139,76,0.45)',
        }}>
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.6,
            backgroundImage: `radial-gradient(circle at 20% 30%, rgba(255,248,229,0.6), transparent 40%),
                              radial-gradient(circle at 80% 70%, rgba(122,92,44,0.2), transparent 40%)`,
          }} />
          <div style={{ position: 'relative' }}>
            <h2 style={{ fontSize: 52, fontWeight: 800, letterSpacing: -1.8, marginBottom: 14, lineHeight: 1.05 }}>{copy.final_cta.h2}</h2>
            <p style={{ fontSize: 18, color: 'rgba(30,26,20,0.75)', marginBottom: 28 }}>{copy.final_cta.sub}</p>
            <button style={{
              background: cream,
              color: ink, fontWeight: 700, padding: '16px 28px',
              borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 16,
              display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'inherit',
              boxShadow: '0 10px 30px rgba(30,26,20,0.18)',
            }}>{copy.final_cta.primary_cta}<Icon name="arrow" size={18} /></button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '48px 40px', borderTop: `1px solid ${border}`, background: cream2 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', justifyContent: 'space-between', gap: 32, flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 320 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <LogoMark size={28} tone="gold" />
              <span style={{ fontSize: 20, fontWeight: 800 }}>Estia</span>
            </div>
            <div style={{ fontSize: 14, color: muted }}>{copy.footer.tagline}</div>
          </div>
          {copy.footer.columns.map((c, i) => (
            <div key={i}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{c.title}</div>
              {c.links.map((l, j) => (
                <a key={j} href={l.href} style={{ display: 'block', color: muted, textDecoration: 'none', fontSize: 14, marginBottom: 8 }}>{l.label}</a>
              ))}
            </div>
          ))}
        </div>
        <div style={{ maxWidth: 1280, margin: '32px auto 0', paddingTop: 20, borderTop: `1px solid ${border}`, fontSize: 13, color: muted, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>{copy.footer.copyright}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icon name="globe" size={13} />עברית · RTL</div>
        </div>
      </footer>
    </div>
  );
}

function StoreBadge({ kind }) {
  return (
    <div style={{
      background: '#fff', color: '#1e1a14', padding: '8px 14px', borderRadius: 10,
      display: 'inline-flex', gap: 8, alignItems: 'center', minWidth: 140,
      border: '1px solid rgba(30,26,20,0.14)',
      boxShadow: '0 2px 6px rgba(30,26,20,0.06)',
    }}>
      <div style={{ fontSize: 22 }}>{kind === 'apple' ? '' : '▶'}</div>
      <div style={{ lineHeight: 1.1 }}>
        <div style={{ fontSize: 9, opacity: 0.6 }}>{kind === 'apple' ? 'להוריד מ' : 'זמין ב'}</div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{kind === 'apple' ? 'App Store' : 'Google Play'}</div>
      </div>
    </div>
  );
}

function AIPlaygroundLight({ ink, muted, gold, goldDark, cream, cream2, border }) {
  const [step, setStep] = React.useState(0);
  const [text, setText] = React.useState('');
  const full = 'דירת 4 חדרים מוארת ומרווחת ברחוב שקט בלב רמת גן, קומה 5 עם מעלית, מרפסת שמש 12 מ״ר פונה לפארק, חניה ומחסן. סמוכה לבתי ספר ותחבורה.';
  React.useEffect(() => {
    const t = setInterval(() => setStep(s => (s + 1) % 3), 3000);
    return () => clearInterval(t);
  }, []);
  React.useEffect(() => {
    if (step !== 1) { setText(''); return; }
    let i = 0;
    const t = setInterval(() => { i += 2; setText(full.slice(0, i)); if (i >= full.length) clearInterval(t); }, 25);
    return () => clearInterval(t);
  }, [step]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: goldDark, fontSize: 13, fontWeight: 700 }}>
        <Icon name="sparkle" size={14} />
        Estia AI Playground
        <div style={{ marginRight: 'auto', fontSize: 11, color: muted }}>v2.4 · נדל״ן</div>
      </div>
      <div style={{
        background: '#fff', border: `1px solid ${border}`,
        borderRadius: 14, padding: 14,
      }}>
        <div style={{ fontSize: 11, color: muted, marginBottom: 6 }}>נתוני נכס</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {[['סוג', 'דירת 4 חד׳'], ['עיר', 'רמת גן'], ['קומה', '5/7'], ['שטח', '104 מ״ר']].map(([k, v]) => (
            <div key={k} style={{
              background: cream2, borderRadius: 8, padding: '8px 10px',
              border: `1px solid ${border}`, fontSize: 12,
            }}>
              <div style={{ color: muted, fontSize: 10 }}>{k}</div>
              <div style={{ fontWeight: 600 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{
        flex: 1, background: '#fff',
        border: `1px solid ${gold}`, borderRadius: 14, padding: 14,
        position: 'relative', minHeight: 140,
      }}>
        <div style={{ fontSize: 11, color: goldDark, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
          <Icon name="sparkle" size={12} />
          תיאור שיווקי · עברית
          <div style={{
            marginRight: 'auto', display: 'flex', gap: 4, alignItems: 'center',
            color: step === 1 ? goldDark : muted, fontSize: 10, fontWeight: 600,
          }}>
            {step === 0 ? '○ מחכה' : step === 1 ? '● מייצר' : '✓ מוכן'}
          </div>
        </div>
        <div style={{ fontSize: 14, color: ink, lineHeight: 1.7 }}>
          {step === 0 && <span style={{ color: muted }}>לחצו על "צור תיאור"…</span>}
          {step === 1 && <>{text}<span style={{ color: gold }}>▍</span></>}
          {step === 2 && full}
        </div>
      </div>
      <button style={{
        background: `linear-gradient(180deg, #d9b774, #b48b4c)`, color: ink,
        padding: '12px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 14,
        fontFamily: 'inherit', cursor: 'pointer',
        boxShadow: '0 6px 16px rgba(180,139,76,0.28)',
      }}>צור תיאור חדש ✦</button>
    </div>
  );
}

window.DirectionA = DirectionA;
