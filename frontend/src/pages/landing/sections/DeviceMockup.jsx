/**
 * Inline SVG + CSS device frame — zero network cost, scales perfectly,
 * no image asset needed. Visual placeholder for the final screenshots
 * until the team drops in polished renders.
 */
export default function DeviceMockup({ ariaLabel }) {
  return (
    <div className="lp-device" role="img" aria-label={ariaLabel}>
      <div className="lp-device-bg">
        <div className="lp-device-screen">
          <div className="lp-device-notch" aria-hidden="true" />
          <div className="lp-mock-header">
            <div className="lp-mock-avatar" />
            <div className="lp-mock-title" />
            <div className="lp-mock-bell" />
          </div>
          <div className="lp-mock-kpis">
            {[0, 1, 2].map((i) => (
              <div className="lp-mock-kpi" key={i}>
                <div className="lp-mock-kpi-n" />
                <div className="lp-mock-kpi-l" />
              </div>
            ))}
          </div>
          {[
            { cls: 'hot'  },
            { cls: 'warm' },
            { cls: 'warm' },
            { cls: 'cold' },
            { cls: 'hot'  },
            { cls: 'cold' },
          ].map((it, i) => (
            <div className="lp-mock-list-item" key={i}>
              <span className={`lp-mock-list-dot ${it.cls}`} />
              <div className="lp-mock-list-body">
                <div className="lp-mock-list-name" />
                <div className="lp-mock-list-meta" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
