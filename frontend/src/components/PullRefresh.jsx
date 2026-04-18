import { usePullToRefresh } from '../hooks/mobile';
import { RefreshCw } from 'lucide-react';
import './PullRefresh.css';

/**
 * Wraps a scrollable region. When user pulls down past threshold on scrollTop
 * 0, calls onRefresh. Shows a gold spinner indicator while pulling.
 *
 * Usage: <PullRefresh onRefresh={() => load()}> <list/> </PullRefresh>
 */
export default function PullRefresh({ onRefresh, children, className = '' }) {
  const { pull, state } = usePullToRefresh(onRefresh);
  const rot = Math.min(360, pull * 3);
  return (
    <div className={`pr-wrap ${className}`}>
      <div
        className={`pr-indicator ${state}`}
        style={{
          opacity: Math.min(1, pull / 56),
          transform: `translateY(${pull - 40}px)`,
        }}
      >
        <div
          className="pr-spinner"
          style={{ transform: `rotate(${rot}deg)` }}
        >
          <RefreshCw size={16} />
        </div>
      </div>
      <div
        className="pr-content"
        style={{
          transform: state === 'refreshing' ? 'translateY(44px)' : `translateY(${pull}px)`,
          transition: state === 'idle' || state === 'refreshing' ? 'transform 0.28s cubic-bezier(0.3, 1.2, 0.5, 1)' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}
