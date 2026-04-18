import { useEffect, useState } from 'react';
import { WifiOff, Check } from 'lucide-react';
import { useOnlineStatus } from '../hooks/mobile';
import './OfflineBanner.css';

export default function OfflineBanner() {
  const online = useOnlineStatus();
  const [justReconnected, setJustReconnected] = useState(false);
  const [everOffline, setEverOffline] = useState(false);

  useEffect(() => {
    if (!online) {
      setEverOffline(true);
      setJustReconnected(false);
      return;
    }
    if (online && everOffline) {
      setJustReconnected(true);
      const t = setTimeout(() => setJustReconnected(false), 2800);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [online, everOffline]);

  if (online && !justReconnected) return null;

  return (
    <div className={`offbanner ${online ? 'offbanner-on' : 'offbanner-off'}`}>
      {online ? (
        <>
          <Check size={13} />
          <span>חזרה לרשת — סנכרון אוטומטי</span>
        </>
      ) : (
        <>
          <WifiOff size={13} />
          <span>אין חיבור — שינויים יישמרו וישלחו עם החזרה</span>
        </>
      )}
    </div>
  );
}
