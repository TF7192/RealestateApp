import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { Check, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((toast) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, ...toast }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), toast.duration || 2200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="m-toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`m-toast ${t.tone || ''}`}>
            {t.tone === 'error' ? <X size={16} /> : <Check size={16} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext) || (() => {});
}
