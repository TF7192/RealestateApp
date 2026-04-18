import './StickyActionBar.css';

/**
 * StickyActionBar — floats above the MobileTabBar on small screens. Use it
 * for primary-action toolbars: form save, property-detail CTAs, etc.
 *
 * Renders as a flex row; children are <button>s.
 */
export default function StickyActionBar({ children, visible = true, className = '' }) {
  return (
    <div className={`sab ${visible ? 'sab-visible' : ''} ${className}`}>
      <div className="sab-inner">{children}</div>
    </div>
  );
}
