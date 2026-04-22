/**
 * App Store + Google Play badges.
 *
 * TODO(landing): iOS + Android apps aren't published yet. Badges render
 * disabled (aria-disabled, pointer-events:none, visual dim). Swap in
 * real store URLs when the listings go live; drop the `disabled` prop.
 */
export default function StoreBadges({ appLabel, playLabel, note, disabled = true }) {
  const commonProps = disabled
    ? { 'aria-disabled': 'true', tabIndex: -1, onClick: (e) => e.preventDefault(), href: '#appstore-coming' }
    : {};

  return (
    <>
      <div className="lp-store-row">
        <a className="lp-store-btn" {...commonProps}>
          <svg className="lp-store-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M17.6 12.7c0-2.9 2.4-4.3 2.5-4.4-1.4-2-3.5-2.3-4.3-2.3-1.8-.2-3.5 1.1-4.4 1.1-.9 0-2.3-1-3.8-1-2 0-3.8 1.2-4.8 3-2.1 3.6-.5 8.9 1.5 11.8 1 1.4 2.2 3 3.7 3 1.5-.1 2.1-1 3.9-1s2.3 1 3.9 1c1.6 0 2.6-1.4 3.6-2.9 1.1-1.6 1.5-3.2 1.6-3.3-.1 0-3.4-1.3-3.4-5zM14.7 4.3c.8-1 1.3-2.3 1.2-3.7-1.1 0-2.5.8-3.3 1.7-.7.9-1.4 2.2-1.2 3.5 1.2.1 2.5-.6 3.3-1.5z"/>
          </svg>
          <span>
            <small>הורדה ב-</small>
            <strong>App Store</strong>
          </span>
        </a>
        <a className="lp-store-btn" {...commonProps}>
          <svg className="lp-store-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M3.6 20.5c-.3-.3-.6-.8-.6-1.4V4.9c0-.6.2-1.1.6-1.4l8.4 8.5-8.4 8.5zm10.7-7.1l-2.2 2.2-8.3-8.4c.1-.1.3-.1.4-.1.2 0 .5.1.7.2l9.4 5.4v.7zM18.2 11.4l-3 1.7-2.5-2.5 2.5-2.5 3 1.7c.6.3.9.8.9 1.3s-.3 1-.9 1.3zM4.2 21c-.3-.1-.5-.3-.6-.5l8.3-8.5 2.2 2.2-9.3 5.4c-.2.1-.4.2-.6.2v-.8z"/>
          </svg>
          <span>
            <small>להורדה ב-</small>
            <strong>Google Play</strong>
          </span>
        </a>
      </div>
      {disabled && note ? <p className="lp-store-note">{note}</p> : null}
    </>
  );
}
