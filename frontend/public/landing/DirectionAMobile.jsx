/* global React, Icon, LogoMark */
const { useState } = React;

// Direction A · Mobile landing — full version matching desktop sections + sticky CTA bar.
function DirectionAMobile({ copy }) {
  const [openFaq, setOpenFaq] = useState(-1);
  const [cycle, setCycle] = useState('yearly');
  const ink = '#1e1a14';
  const cream = '#f7f3ec';
  const cream2 = '#efe9df';
  const cream3 = '#e8dfcf';
  const cream4 = '#fbf7f0';
  const gold = '#b48b4c';
  const goldLight = '#d9b774';
  const goldDark = '#7a5c2c';
  const muted = '#6b6356';
  const border = 'rgba(30,26,20,0.08)';

  const btnPri = {
    background: `linear-gradient(180deg, ${goldLight} 0%, ${gold} 100%)`,
    color: ink, fontWeight: 700, padding: '14px 18px',
    borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 15, width: '100%',
    boxShadow: '0 8px 20px rgba(180,139,76,0.28), inset 0 1px 0 rgba(255,255,255,0.35)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit',
  };
  const btnSec = {
    background: '#fff', color: ink, fontWeight: 600, padding: '13px 18px',
    borderRadius: 12, border: `1px solid rgba(30,26,20,0.14)`, cursor: 'pointer', fontSize: 14, width: '100%',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit',
  };

  const ScreenCard = ({ title, body }) => (
    <div style={{
      background: '#fff', borderRadius: 18, padding: 14, width: 240, flexShrink: 0,
      boxShadow: '0 18px 40px rgba(30,26,20,0.16)', border: `1px solid ${border}`,
      scrollSnapAlign: 'center',
    }}>
      <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
        <div style={{ width: 7, height: 7, borderRadius: 99, background: '#e8806f' }} />
        <div style={{ width: 7, height: 7, borderRadius: 99, background: '#ebc25d' }} />
        <div style={{ width: 7, height: 7, borderRadius: 99, background: '#72bf6b' }} />
      </div>
      <div style={{ height: 260, background: cream2, borderRadius: 12, padding: 10, overflow: 'hidden' }}>
        {body}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: ink, marginTop: 8, textAlign: 'center' }}>{title}</div>
    </div>
  );

  const Eyebrow = ({ children }) => (
    <div style={{ color: goldDark, fontWeight: 700, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>
      {children}
    </div>
  );

  const recommended = copy.pricing.tiers.find(t => t.recommended);

  return (
    <div dir="rtl" style={{
      background: cream, color: ink, fontFamily: 'Assistant, Heebo, sans-serif',
      minHeight: '100%', lineHeight: 1.5, overflow: 'auto', height: '100%',
      paddingBottom: 76, position: 'relative',
    }}>
      {/* Sticky header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10, background: 'rgba(247,243,236,0.92)',
        backdropFilter: 'blur(12px)', borderBottom: `1px solid ${border}`,
        padding: '12px 18px', display: 'flex', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LogoMark size={26} tone="gold" />
          <span style={{ fontSize: 18, fontWeight: 800 }}>Estia</span>
        </div>
        <div style={{ marginRight: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          <a style={{ color: ink, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>התחברות</a>
          <Icon name="menu" size={22} />
        </div>
      </header>

      {/* Hero */}
      <section style={{ padding: '32px 20px 24px', position: 'relative', textAlign: 'center' }}>
        <div style={{
          position: 'absolute', top: -80, right: '50%', width: 420, height: 420, pointerEvents: 'none',
          transform: 'translateX(50%)',
          background: 'radial-gradient(circle, rgba(180,139,76,0.22), transparent 60%)',
        }} />
        <div style={{ position: 'relative' }}>
          <div style={{
            display: 'inline-flex', gap: 6, alignItems: 'center', padding: '5px 11px',
            background: 'rgba(180,139,76,0.12)', border: `1px solid rgba(180,139,76,0.22)`,
            borderRadius: 99, fontSize: 11, color: goldDark, fontWeight: 600, marginBottom: 14,
          }}>
            <Icon name="sparkle" size={11} />
            {copy.hero.eyebrow}
          </div>
          <h1 style={{
            fontSize: 36, lineHeight: 1.04, letterSpacing: -1.4, fontWeight: 800,
            marginBottom: 12, textWrap: 'balance',
          }}>
            {copy.hero.h1_line_1}<br/>
            <span style={{
              background: `linear-gradient(135deg, ${gold}, ${goldLight})`,
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}>{copy.hero.h1_line_2}</span>
          </h1>
          <p style={{ fontSize: 15, color: muted, marginBottom: 20, maxWidth: 320, marginInline: 'auto' }}>{copy.hero.sub}</p>
          <button style={btnPri}>{copy.hero.primary_cta}<Icon name="arrow" size={15} /></button>
          <button style={{ ...btnSec, marginTop: 8 }}>{copy.hero.secondary_cta}</button>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 14 }}>
            {copy.hero.trust.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center', color: muted, fontSize: 11, fontWeight: 500 }}>
                <Icon name="check" size={11} stroke={3} />{t}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Screen gallery */}
      <section style={{ padding: '8px 0 40px' }}>
        <div style={{
          display: 'flex', gap: 14, overflowX: 'auto', scrollSnapType: 'x mandatory',
          padding: '10px 30px 24px', scrollbarWidth: 'none',
        }}>
          <ScreenCard title="לוח בקרה" body={
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 6 }}>
                {['12', '34', '5', '84K'].map((v, i) => (
                  <div key={i} style={{ background: '#fff', borderRadius: 6, padding: '6px 7px' }}>
                    <div style={{ fontSize: 7, color: muted }}>מדד</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: gold }}>{v}</div>
                  </div>
                ))}
              </div>
              {['דנה כהן', 'יוסי לוי', 'מיכל אבן'].map((n, i) => (
                <div key={i} style={{ background: '#fff', borderRadius: 6, padding: '6px 7px', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 16, height: 16, borderRadius: 99, background: gold }} />
                  <div style={{ fontSize: 9, fontWeight: 600 }}>{n}</div>
                  <div style={{ marginRight: 'auto', fontSize: 7, color: '#b91c1c', fontWeight: 700 }}>חם</div>
                </div>
              ))}
            </div>
          } />
          <ScreenCard title="AI · Premium" body={
            <div>
              <div style={{ fontSize: 8, color: goldDark, fontWeight: 700, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 3 }}>
                ✦ תיאור שיווקי
                <div style={{
                  marginRight: 'auto', background: `linear-gradient(180deg, ${goldLight}, ${gold})`,
                  color: ink, padding: '1px 6px', borderRadius: 99, fontSize: 7, fontWeight: 800,
                }}>PRO</div>
              </div>
              <div style={{ background: '#fff', borderRadius: 6, padding: 8, fontSize: 9, lineHeight: 1.5, color: ink, border: `1px solid ${gold}` }}>
                דירת 4 חדרים מוארת ברחוב שקט ברמת גן, קומה 5 עם מעלית, מרפסת שמש פונה לפארק…<span style={{ color: gold }}>▍</span>
              </div>
              <div style={{
                marginTop: 8, background: `linear-gradient(180deg, ${goldLight}, ${gold})`,
                color: ink, padding: '5px', borderRadius: 5, fontSize: 9, fontWeight: 700, textAlign: 'center',
              }}>צור תיאור ✦</div>
            </div>
          } />
          <ScreenCard title="נכסים" body={
            <div>
              {[1,2,3].map(i => (
                <div key={i} style={{ background: '#fff', borderRadius: 6, padding: 6, marginBottom: 4, display: 'flex', gap: 6 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 4, background: `linear-gradient(135deg, ${goldLight}, ${gold})`, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 9, fontWeight: 700 }}>דירת 4 חד׳</div>
                    <div style={{ fontSize: 7, color: muted }}>רמת גן · ₪3.2M</div>
                    <div style={{ fontSize: 7, color: gold, fontWeight: 700 }}>בלעדיות ✦</div>
                  </div>
                </div>
              ))}
            </div>
          } />
          <ScreenCard title="לוח זמנים" body={
            <div>
              {[['09:00','פגישה · משפ׳ לוי'],['11:30','צפייה · רמת גן'],['14:00','חוזה בלעדיות'],['17:00','צפייה · הרצליה']].map(([t,l],i)=>(
                <div key={i} style={{ background: '#fff', borderRadius: 6, padding: '6px 7px', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ background: 'rgba(180,139,76,0.14)', color: goldDark, fontSize: 7, fontWeight: 700, padding: '2px 5px', borderRadius: 3 }}>{t}</div>
                  <div style={{ fontSize: 8, fontWeight: 600 }}>{l}</div>
                </div>
              ))}
            </div>
          } />
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: '40px 20px', background: cream2, borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}` }}>
        <Eyebrow>{copy.features.section_eyebrow}</Eyebrow>
        <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.8, lineHeight: 1.1, marginBottom: 10 }}>
          {copy.features.section_title}
        </h2>
        <p style={{ fontSize: 14, color: muted, marginBottom: 22 }}>{copy.features.section_sub}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {copy.features.cards.map((c) => {
            const iconName = { ai: 'sparkle', leads: 'users', properties: 'home', calendar: 'calendar', calculator: 'calc', mobile: 'phone' }[c.key];
            const featured = c.key === 'ai';
            return (
              <div key={c.key} style={{
                background: featured ? `linear-gradient(160deg, ${cream4}, ${cream3})` : '#fff',
                border: featured ? `2px solid ${gold}` : `1px solid ${border}`,
                borderRadius: 16, padding: 18, position: 'relative',
                boxShadow: featured ? '0 12px 30px rgba(180,139,76,0.18)' : 'none',
              }}>
                {featured && (
                  <div style={{
                    position: 'absolute', top: -10, left: 14,
                    background: `linear-gradient(180deg, ${goldLight}, ${gold})`,
                    color: ink, padding: '3px 9px', borderRadius: 99, fontSize: 10, fontWeight: 800, letterSpacing: 0.4,
                    boxShadow: '0 4px 10px rgba(180,139,76,0.35)',
                  }}>✦ PREMIUM</div>
                )}
                <div style={{ display: 'flex', gap: 12, alignItems: 'start' }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    display: 'grid', placeItems: 'center',
                    background: 'rgba(180,139,76,0.14)', color: gold,
                  }}>
                    <Icon name={iconName} size={18} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{c.title}</div>
                    <div style={{ fontSize: 13, color: muted }}>{c.body}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* AI spotlight */}
      <section style={{ padding: '40px 20px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
          background: `linear-gradient(180deg, ${goldLight}, ${gold})`, color: ink,
          borderRadius: 99, fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
          boxShadow: '0 6px 14px rgba(180,139,76,0.3)', marginBottom: 12,
        }}>
          <Icon name="star" size={12} />PREMIUM ONLY · ✦
        </div>
        <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.8, lineHeight: 1.1, marginBottom: 8 }}>
          {copy.ai.title}
        </h2>
        <p style={{ fontSize: 14, color: muted, marginBottom: 14 }}>{copy.ai.sub}</p>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px',
          background: '#fff', border: `1px dashed ${gold}`, borderRadius: 10,
          fontSize: 12, color: goldDark, fontWeight: 600, marginBottom: 16,
        }}>
          <Icon name="shield" size={13} />כלול רק במסלול Premium
        </div>
        <div style={{
          background: cream4, borderRadius: 16, padding: 16,
          border: `2px solid ${gold}`, boxShadow: '0 0 0 5px rgba(180,139,76,0.08)',
        }}>
          <div style={{ fontSize: 11, color: goldDark, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="sparkle" size={12} />
            Estia AI · תיאור שיווקי
            <div style={{
              marginRight: 'auto', background: `linear-gradient(180deg, ${goldLight}, ${gold})`,
              color: ink, padding: '2px 7px', borderRadius: 99, fontSize: 9, fontWeight: 800,
            }}>PRO</div>
          </div>
          <div style={{ background: '#fff', borderRadius: 10, padding: 12, fontSize: 13, color: ink, lineHeight: 1.7, border: `1px solid ${border}` }}>
            דירת 4 חדרים מוארת ומרווחת ברחוב שקט בלב רמת גן, קומה 5 עם מעלית, מרפסת שמש 12 מ״ר פונה לפארק, חניה ומחסן.<span style={{ color: gold }}>▍</span>
          </div>
        </div>
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {copy.ai.actions.map((a, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
              background: '#fff', border: `1px solid ${border}`, borderRadius: 10,
            }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(180,139,76,0.14)', color: gold, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Icon name="sparkle" size={13} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{a.label}</div>
                <div style={{ fontSize: 11, color: muted }}>{a.hint}</div>
              </div>
              <div style={{
                background: `linear-gradient(180deg, ${goldLight}, ${gold})`,
                color: ink, padding: '2px 7px', borderRadius: 99, fontSize: 9, fontWeight: 800,
              }}>PRO</div>
            </div>
          ))}
        </div>
      </section>

      {/* Mobile app section */}
      <section style={{ padding: '40px 20px', background: cream3, borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}` }}>
        <Eyebrow>{copy.mobile.section_eyebrow}</Eyebrow>
        <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.8, lineHeight: 1.1, marginBottom: 10 }}>
          {copy.mobile.section_title}
        </h2>
        <p style={{ fontSize: 14, color: muted, marginBottom: 18 }}>{copy.mobile.section_sub}</p>
        {copy.mobile.bullets.map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'start' }}>
            <div style={{
              width: 22, height: 22, borderRadius: 99, flexShrink: 0,
              background: `linear-gradient(135deg, ${goldLight}, ${gold})`, color: ink,
              display: 'grid', placeItems: 'center', marginTop: 1,
            }}>
              <Icon name="check" size={12} stroke={3} />
            </div>
            <div style={{ fontSize: 14, color: ink }}>{b}</div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <StoreBadge kind="apple" />
          <StoreBadge kind="google" />
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: muted }}>{copy.hero.store_disabled_note}</div>
      </section>

      {/* How it works */}
      <section style={{ padding: '40px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.8, lineHeight: 1.1, marginBottom: 8 }}>
            {copy.how.section_title}
          </h2>
          <p style={{ fontSize: 14, color: muted }}>{copy.how.section_sub}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {copy.how.steps.map((s, i) => (
            <div key={i} style={{
              background: '#fff', border: `1px solid ${border}`, borderRadius: 16, padding: 18,
              display: 'flex', gap: 14, alignItems: 'start',
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: `linear-gradient(135deg, ${goldLight}, ${gold})`, color: ink,
                display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 17,
                boxShadow: '0 4px 10px rgba(180,139,76,0.25)',
              }}>{s.n}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{s.title}</div>
                <div style={{ fontSize: 13, color: muted }}>{s.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section style={{ padding: '40px 20px', background: cream2, borderTop: `1px solid ${border}` }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <Eyebrow>{copy.pricing.section_eyebrow}</Eyebrow>
          <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.8, marginBottom: 8 }}>{copy.pricing.section_title}</h2>
          <p style={{ fontSize: 14, color: muted }}>{copy.pricing.section_sub}</p>
        </div>

        {/* Cycle toggle */}
        <div style={{
          display: 'flex', background: cream3, borderRadius: 10, padding: 3, gap: 2, marginBottom: 16,
        }}>
          {[
            { k: 'monthly', l: copy.pricing.cycle_monthly },
            { k: 'yearly', l: copy.pricing.cycle_yearly },
          ].map(o => {
            const on = cycle === o.k;
            return (
              <button key={o.k} onClick={() => setCycle(o.k)} style={{
                flex: 1, padding: '9px 10px', borderRadius: 8, border: 'none',
                background: on ? '#fff' : 'transparent', color: on ? ink : muted,
                fontWeight: on ? 700 : 600, fontSize: 12, cursor: 'pointer',
                boxShadow: on ? '0 2px 6px rgba(30,26,20,0.08)' : 'none',
                fontFamily: 'inherit',
              }}>{o.l}</button>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {copy.pricing.tiers.map(t => {
            const featured = t.recommended;
            const price = cycle === 'yearly' ? Math.round(t.yearly / 12) : t.monthly;
            return (
              <div key={t.key} style={{
                background: featured ? `linear-gradient(160deg, ${cream4}, ${cream3})` : '#fff',
                border: featured ? `2px solid ${gold}` : `1px solid ${border}`,
                borderRadius: 20, padding: 22, position: 'relative',
                boxShadow: featured ? '0 20px 50px rgba(180,139,76,0.2)' : 'none',
              }}>
                {featured && (
                  <div style={{
                    position: 'absolute', top: -11, right: 18,
                    background: `linear-gradient(180deg, ${goldLight}, ${gold})`,
                    color: ink, padding: '4px 10px', borderRadius: 99,
                    fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
                    boxShadow: '0 4px 10px rgba(180,139,76,0.35)',
                  }}>{t.recommended_badge} · כולל AI ✦</div>
                )}
                <div style={{ fontSize: 17, fontWeight: 700 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: muted, marginBottom: 12 }}>{t.lead}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 4 }}>
                  <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1.5, color: featured ? goldDark : ink }}>{copy.pricing.currency}{price}</div>
                  <div style={{ fontSize: 13, color: muted }}>/ חודש</div>
                </div>
                {cycle === 'yearly' && (
                  <div style={{ fontSize: 11, color: goldDark, fontWeight: 600, marginBottom: 12 }}>
                    חיוב שנתי {copy.pricing.currency}{t.yearly} — חודשיים מתנה
                  </div>
                )}
                {cycle !== 'yearly' && <div style={{ marginBottom: 12 }} />}
                <button style={{
                  width: '100%',
                  background: featured ? `linear-gradient(180deg, ${goldLight}, ${gold})` : '#fff',
                  color: ink, fontWeight: 700, padding: '11px', borderRadius: 10,
                  border: featured ? 'none' : `1px solid rgba(30,26,20,0.14)`, cursor: 'pointer',
                  fontSize: 14, fontFamily: 'inherit', marginBottom: 14,
                }}>{t.cta}</button>
                <div style={{ borderTop: `1px solid ${border}`, paddingTop: 12 }}>
                  {t.bullets.map((b, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'start', marginBottom: 7, fontSize: 12.5 }}>
                      <span style={{ color: gold, flexShrink: 0, marginTop: 2 }}><Icon name="check" size={12} stroke={3} /></span>
                      <span>{b}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
          {copy.pricing.trust.map((t, i) => (
            <div key={i} style={{ fontSize: 11, color: muted, display: 'flex', gap: 4, alignItems: 'center' }}>
              <Icon name="check" size={11} stroke={3} />{t}
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, color: muted, marginTop: 10 }}>{copy.pricing.vat_note}</div>
      </section>

      {/* FAQ */}
      <section style={{ padding: '40px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <Eyebrow>{copy.faq.section_eyebrow}</Eyebrow>
          <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.8 }}>{copy.faq.section_title}</h2>
        </div>
        {copy.faq.items.map((f, i) => (
          <div key={i} onClick={() => setOpenFaq(openFaq === i ? -1 : i)} style={{
            borderBottom: `1px solid ${border}`, padding: '14px 2px', cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{f.q}</div>
              <div style={{ color: gold, transform: openFaq === i ? 'rotate(180deg)' : 'none', transition: 'transform 200ms', flexShrink: 0 }}>
                <Icon name="chevron" size={14} />
              </div>
            </div>
            {openFaq === i && <div style={{ marginTop: 8, fontSize: 13, color: muted, lineHeight: 1.6 }}>{f.a}</div>}
          </div>
        ))}
      </section>

      {/* Final CTA */}
      <section style={{ padding: '20px 20px 32px' }}>
        <div style={{
          background: `linear-gradient(135deg, ${goldLight} 0%, ${gold} 60%, ${goldDark} 100%)`,
          borderRadius: 24, padding: '36px 22px', color: ink, textAlign: 'center',
          boxShadow: '0 30px 60px -10px rgba(180,139,76,0.4)',
        }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.9, marginBottom: 8, lineHeight: 1.1 }}>{copy.final_cta.h2}</h2>
          <p style={{ fontSize: 14, color: 'rgba(30,26,20,0.7)', marginBottom: 18 }}>{copy.final_cta.sub}</p>
          <button style={{
            background: cream, color: ink, fontWeight: 700, padding: '13px 22px',
            borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14,
            display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
            boxShadow: '0 6px 16px rgba(30,26,20,0.18)',
          }}>{copy.final_cta.primary_cta}<Icon name="arrow" size={14} /></button>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '28px 20px 40px', background: cream2, borderTop: `1px solid ${border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <LogoMark size={28} tone="gold" />
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Estia</div>
            <div style={{ fontSize: 11, color: muted }}>{copy.footer.tagline}</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
          {copy.footer.columns.map((col, i) => (
            <div key={i}>
              <div style={{ fontSize: 11, fontWeight: 700, color: goldDark, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{col.title}</div>
              {col.links.map((l, j) => (
                <div key={j} style={{ fontSize: 13, color: ink, marginBottom: 6 }}>{l.label}</div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: muted, borderTop: `1px solid ${border}`, paddingTop: 14, textAlign: 'center' }}>
          {copy.footer.copyright}
        </div>
      </footer>

      {/* Sticky bottom CTA bar */}
      <div style={{
        position: 'sticky', bottom: 0, left: 0, right: 0, zIndex: 20,
        background: 'rgba(247,243,236,0.95)', backdropFilter: 'blur(14px)',
        borderTop: `1px solid ${border}`, padding: '10px 16px 12px',
        display: 'flex', gap: 8, alignItems: 'center',
        boxShadow: '0 -8px 24px rgba(30,26,20,0.06)',
        marginTop: -76, // pull up over the padding-bottom reservation
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: muted, lineHeight: 1.2 }}>30 יום חינם · בלי כרטיס אשראי</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: ink }}>התחילו עכשיו</div>
        </div>
        <button style={{
          background: `linear-gradient(180deg, ${goldLight} 0%, ${gold} 100%)`,
          color: ink, fontWeight: 700, padding: '11px 16px', borderRadius: 10,
          border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
          display: 'inline-flex', alignItems: 'center', gap: 5,
          boxShadow: '0 6px 14px rgba(180,139,76,0.3)',
          whiteSpace: 'nowrap',
        }}>
          {copy.hero.primary_cta.length > 16 ? 'התחלה חינם' : copy.hero.primary_cta}
          <Icon name="arrow" size={13} />
        </button>
      </div>
    </div>
  );
}

function StoreBadge({ kind }) {
  const ink = '#1e1a14';
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px',
      background: ink, color: '#fff', borderRadius: 10, flex: 1, justifyContent: 'center',
    }}>
      <div style={{ fontSize: 18 }}>{kind === 'apple' ? '' : '▶'}</div>
      <div style={{ lineHeight: 1.1 }}>
        <div style={{ fontSize: 8, opacity: 0.6 }}>{kind === 'apple' ? 'להוריד מ' : 'זמין ב'}</div>
        <div style={{ fontSize: 12, fontWeight: 700 }}>{kind === 'apple' ? 'App Store' : 'Google Play'}</div>
      </div>
    </div>
  );
}

window.DirectionAMobile = DirectionAMobile;
