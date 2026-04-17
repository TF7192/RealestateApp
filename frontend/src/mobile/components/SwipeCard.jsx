import { useRef, useState, useCallback } from 'react';
import { haptics } from '../../native';

/**
 * Swipeable card — reveals action buttons underneath on horizontal drag.
 * In an RTL layout, swiping LEFT (negative translateX) reveals actions on the
 * trailing (visually right) side. We keep the interaction that way so it matches
 * native iOS behavior where the primary action appears under your thumb as you swipe.
 *
 * Props:
 *   actions: [{ key, label, icon, className, onClick }]
 *   children: card content
 */
export default function SwipeCard({ children, actions = [], onTap, threshold = 60, maxReveal = 240 }) {
  const startX = useRef(null);
  const currentX = useRef(0);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const opened = useRef(false);

  const onStart = (clientX) => {
    startX.current = clientX;
    currentX.current = offset;
    setDragging(true);
  };

  const onMove = (clientX) => {
    if (startX.current == null) return;
    let dx = clientX - startX.current + currentX.current;
    // Only allow LEFT swipe (negative) to reveal RTL trailing actions
    dx = Math.min(0, Math.max(-maxReveal * 1.2, dx));
    setOffset(dx);
    if (!opened.current && dx < -threshold) {
      opened.current = true;
      haptics.tap();
    } else if (opened.current && dx > -threshold) {
      opened.current = false;
    }
  };

  const onEnd = () => {
    if (startX.current == null) return;
    setDragging(false);
    if (offset < -threshold) {
      setOffset(-maxReveal);
    } else {
      setOffset(0);
    }
    startX.current = null;
  };

  const close = useCallback(() => setOffset(0), []);

  const handleTap = (e) => {
    if (offset !== 0) { close(); return; }
    if (Math.abs(offset) < 3) onTap?.(e);
  };

  return (
    <div className="m-swipe">
      <div
        className={`m-swipe-row ${dragging ? 'dragging' : ''}`}
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={(e) => onStart(e.touches[0].clientX)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
        onTouchEnd={onEnd}
        onMouseDown={(e) => onStart(e.clientX)}
        onMouseMove={(e) => dragging && onMove(e.clientX)}
        onMouseUp={onEnd}
        onMouseLeave={() => dragging && onEnd()}
        onClick={handleTap}
      >
        {children}
      </div>
      <div className="m-swipe-actions left" style={{ width: maxReveal }}>
        {actions.map((a) => (
          <button
            key={a.key}
            className={`m-swipe-btn ${a.className || ''}`}
            onClick={(e) => {
              e.stopPropagation();
              haptics.press();
              a.onClick?.();
              close();
            }}
          >
            {a.icon}
            <span>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
