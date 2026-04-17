import { haptics } from '../../native';

export default function PressButton({ onClick, haptic = 'tap', children, className = '', ...rest }) {
  const handle = (e) => {
    const h = haptics[haptic] || haptics.tap;
    h();
    onClick?.(e);
  };
  return (
    <button className={className} onClick={handle} {...rest}>
      {children}
    </button>
  );
}
