import './EmptyState.css';

// F-4.5 — canonical empty state. Consistent across every list / tab /
// widget in the app so emptiness always feels intentional (new user
// onboarding) rather than broken (network error masquerading).
//
// Usage:
//   <EmptyState
//     icon={<Building2 size={44} />}
//     title="אין נכסים ברשימה"
//     description="העלה את הנכס הראשון שלך והתחל לשווק"
//     action={{ label: 'הוסף נכס', onClick: () => navigate('/properties/new') }}
//     secondary={{ label: 'ייבא מ-Yad2', onClick: ... }}
//   />
export default function EmptyState({
  icon,
  title,
  description,
  action,
  secondary,
  variant = 'first', // 'first' (onboarding) | 'filtered' (no results)
}) {
  return (
    <div className={`es-root es-${variant}`} role="status" dir="rtl">
      {icon && <div className="es-icon">{icon}</div>}
      {title && <h3 className="es-title">{title}</h3>}
      {description && <p className="es-desc">{description}</p>}
      {(action || secondary) && (
        <div className="es-actions">
          {action && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={action.onClick}
              aria-label={action.ariaLabel || action.label}
            >
              {action.icon}
              {action.label}
            </button>
          )}
          {secondary && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={secondary.onClick}
              aria-label={secondary.ariaLabel || secondary.label}
            >
              {secondary.icon}
              {secondary.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
