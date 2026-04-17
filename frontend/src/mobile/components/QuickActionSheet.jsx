import { useNavigate } from 'react-router-dom';
import { Plus, UserPlus, MessageCircle, Building2, PhoneCall, MapPin, Calendar } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { haptics } from '../../native';

export default function QuickActionSheet({ open, onClose }) {
  const navigate = useNavigate();

  const go = (path) => {
    haptics.press();
    onClose();
    navigate(path);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="פעולה מהירה">
      <div className="m-action-grid">
        <button className="m-action" onClick={() => go('/properties/new')}>
          <div className="m-action-icon"><Building2 size={20} /></div>
          <div>
            נכס חדש
            <div className="m-action-sub">קליטת נכס לתיק</div>
          </div>
        </button>
        <button className="m-action" onClick={() => go('/leads/new')}>
          <div className="m-action-icon"><UserPlus size={20} /></div>
          <div>
            ליד חדש
            <div className="m-action-sub">שיחה שהגיעה עכשיו</div>
          </div>
        </button>
        <button className="m-action" onClick={() => go('/properties?near=me')}>
          <div className="m-action-icon"><MapPin size={20} /></div>
          <div>
            נכסים קרובים
            <div className="m-action-sub">לפי מיקום נוכחי</div>
          </div>
        </button>
        <button className="m-action" onClick={() => go('/leads?filter=hot')}>
          <div className="m-action-icon"><PhoneCall size={20} /></div>
          <div>
            לידים חמים
            <div className="m-action-sub">לטיפול היום</div>
          </div>
        </button>
        <button className="m-action" onClick={() => go('/deals')}>
          <div className="m-action-icon"><Calendar size={20} /></div>
          <div>
            עסקאות פתוחות
            <div className="m-action-sub">עדכון סטטוס</div>
          </div>
        </button>
        <button className="m-action" onClick={() => go('/properties')}>
          <div className="m-action-icon"><MessageCircle size={20} /></div>
          <div>
            שליחה ללקוח
            <div className="m-action-sub">וואטסאפ + קישור</div>
          </div>
        </button>
      </div>
    </BottomSheet>
  );
}
