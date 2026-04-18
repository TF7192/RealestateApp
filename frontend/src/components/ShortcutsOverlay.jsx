import { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';
import Portal from './Portal';
import './ShortcutsOverlay.css';

const SECTIONS = [
  {
    title: 'ניווט מהיר',
    rows: [
      { keys: ['G', 'H'], label: 'דשבורד' },
      { keys: ['G', 'P'], label: 'נכסים' },
      { keys: ['G', 'C'], label: 'לקוחות' },
      { keys: ['G', 'D'], label: 'עסקאות' },
      { keys: ['G', 'T'], label: 'תבניות' },
    ],
  },
  {
    title: 'יצירה',
    rows: [
      { keys: ['N'],     label: 'נכס חדש' },
      { keys: ['L'],     label: 'ליד חדש' },
    ],
  },
  {
    title: 'חיפוש',
    rows: [
      { keys: ['⌘', 'K'], label: 'פתח חיפוש כללי (Cmd/Ctrl + K)' },
      { keys: ['/'],      label: 'מקד את שורת החיפוש בעמוד' },
    ],
  },
  {
    title: 'פעולות',
    rows: [
      { keys: ['?'],   label: 'הצג מקלדת קיצורים' },
      { keys: ['Esc'], label: 'סגור חלונות / טופסי עריכה' },
    ],
  },
];

export default function ShortcutsOverlay({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <Portal>
      <div className="kbov-back" onClick={onClose} role="dialog" aria-label="קיצורי מקלדת">
        <div className="kbov-card" onClick={(e) => e.stopPropagation()}>
          <header className="kbov-head">
            <div>
              <span className="kbov-eyebrow"><Keyboard size={11} /> קיצורי מקלדת</span>
              <h3>זריז יותר עם המקלדת</h3>
            </div>
            <button className="kbov-close" onClick={onClose} aria-label="סגור">
              <X size={16} />
            </button>
          </header>
          <div className="kbov-grid">
            {SECTIONS.map((s) => (
              <section key={s.title} className="kbov-section">
                <h4>{s.title}</h4>
                <ul>
                  {s.rows.map((r, i) => (
                    <li key={i}>
                      <span className="kbov-keys">
                        {r.keys.map((k, j) => (
                          <span key={j}>
                            <kbd>{k}</kbd>
                            {j < r.keys.length - 1 && <em>אחר־כך</em>}
                          </span>
                        ))}
                      </span>
                      <span className="kbov-label">{r.label}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <footer className="kbov-foot">
            לחץ <kbd>?</kbd> בכל עמוד כדי לפתוח שוב
          </footer>
        </div>
      </div>
    </Portal>
  );
}
