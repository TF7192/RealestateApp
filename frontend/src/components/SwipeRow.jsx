import { Children, cloneElement, isValidElement } from 'react';
import { useSwipeActions } from '../hooks/mobile';
import './SwipeRow.css';

/**
 * SwipeRow — wraps a card-like element so swipe-left (RTL: trailing) reveals
 * a vertical tray of action buttons. Ideal for lead + property cards.
 *
 * Usage:
 *   <SwipeRow actions={[
 *     { icon: Phone,    label: 'התקשר', onClick: () => call(), color: 'gold' },
 *     { icon: Message,  label: 'וואטסאפ', onClick: () => wa(), color: 'green' },
 *   ]}>
 *     <YourCardContent />
 *   </SwipeRow>
 */
export default function SwipeRow({ actions = [], children, disabled }) {
  const swipe = useSwipeActions({ disabled });
  return (
    <div className={`swrow ${swipe.open ? 'open' : ''}`}>
      <div
        className="swrow-surface"
        style={{ transform: `translateX(${swipe.offset}px)` }}
        onTouchStart={swipe.onTouchStart}
        onTouchMove={swipe.onTouchMove}
        onTouchEnd={swipe.onTouchEnd}
      >
        {Children.map(children, (child) =>
          isValidElement(child)
            ? cloneElement(child, {
                onClickCapture: (e) => {
                  if (swipe.open) {
                    e.preventDefault();
                    e.stopPropagation();
                    swipe.reset();
                  }
                  child.props.onClickCapture?.(e);
                },
              })
            : child
        )}
      </div>
      <div className="swrow-actions" aria-hidden={!swipe.open}>
        {actions.map((a, i) => {
          const Icon = a.icon;
          return (
            <button
              key={i}
              type="button"
              className={`swrow-act swrow-act-${a.color || 'default'}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                swipe.reset();
                a.onClick?.(e);
              }}
              aria-label={a.label}
            >
              {Icon && <Icon size={18} />}
              <small>{a.label}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
