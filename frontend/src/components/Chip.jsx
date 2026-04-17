import './Chip.css';

/**
 * Unified status/tag chip. Use one component for every status indicator
 * across the app so colors/widths/weights stay consistent.
 *
 * tone: neutral | gold | info | success | warning | danger | hot | warm | cold | buy | rent
 * size: sm | md (default sm)
 */
export default function Chip({
  tone = 'neutral',
  size = 'sm',
  icon: Icon,
  children,
  onClick,
  className = '',
  title,
}) {
  const Comp = onClick ? 'button' : 'span';
  return (
    <Comp
      className={`chip chip-${tone} chip-${size} ${onClick ? 'chip-clickable' : ''} ${className}`}
      onClick={onClick}
      title={title}
      type={onClick ? 'button' : undefined}
    >
      {Icon && <Icon size={size === 'md' ? 13 : 11} />}
      <span>{children}</span>
    </Comp>
  );
}
