import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftRight,
  Check,
  X as XIcon,
  MessageCircle,
  Send,
  Inbox,
  ArrowUpFromLine,
  Building2,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import api from '../lib/api';
import { useToast, optimisticUpdate } from '../lib/toast';
import { relativeTime, absoluteTime } from '../lib/time';
import { useDelayedFlag } from '../hooks/mobile';
import PageTour from '../components/PageTour';
import './Transfers.css';

function statusInfo(s) {
  switch (s) {
    case 'PENDING':       return { label: 'בהמתנה', tone: 'warning', Icon: Clock };
    case 'ACCEPTED':      return { label: 'אושר',   tone: 'success', Icon: CheckCircle2 };
    case 'DECLINED':      return { label: 'נדחה',    tone: 'danger',  Icon: XIcon };
    case 'CANCELLED':     return { label: 'בוטל',    tone: 'muted',   Icon: XIcon };
    case 'WHATSAPP_SENT': return { label: 'נשלח בוואטסאפ', tone: 'info', Icon: MessageCircle };
    default:              return { label: s, tone: 'muted', Icon: Clock };
  }
}

export default function Transfers() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const showSkel = useDelayedFlag(loading, 220);
  const [tab, setTab] = useState('incoming');

  const load = async () => {
    try {
      const r = await api.listTransfers();
      setItems(r.items || []);
    } catch (_) { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const incoming = useMemo(
    () => items.filter((t) => t.direction === 'incoming'),
    [items]
  );
  const outgoing = useMemo(
    () => items.filter((t) => t.direction === 'outgoing'),
    [items]
  );
  const pendingIncoming = incoming.filter((t) => t.status === 'PENDING').length;

  const handleAccept = async (t) => {
    try {
      await optimisticUpdate(toast, {
        label: 'מאשר קבלת נכס…',
        success: 'הנכס הועבר אליך בהצלחה',
        onSave: () => api.acceptTransfer(t.id),
      });
      await load();
    } catch { /* toast handled */ }
  };

  const handleDecline = async (t) => {
    try {
      await optimisticUpdate(toast, {
        label: 'דוחה…',
        success: 'הבקשה נדחתה',
        onSave: () => api.declineTransfer(t.id),
      });
      await load();
    } catch { /* toast handled */ }
  };

  const handleCancel = async (t) => {
    try {
      await optimisticUpdate(toast, {
        label: 'מבטל…',
        success: 'הבקשה בוטלה',
        onSave: () => api.cancelTransfer(t.id),
      });
      await load();
    } catch { /* toast handled */ }
  };

  const list = tab === 'incoming' ? incoming : outgoing;

  return (
    <div className="transfers-page">
      <PageTour
        pageKey="transfers"
        steps={[
          { target: 'body', placement: 'center',
            title: 'העברות נכסים',
            content: 'כל העברה נכנסת או יוצאת של נכס בין סוכנים במערכת. בעלי הנכסים עוברים איתם אוטומטית.' },
          { target: 'body', placement: 'center',
            content: 'העברה מתחילה מעמוד הנכס (כפתור "העבר"). סוכן המקבל מאשר, והנכס עובר לחשבון שלו.' },
        ]}
      />
      <div className="page-header animate-in">
        <div className="page-header-info">
          <h2>העברות</h2>
          <p>ניהול העברת נכסים בין סוכנים</p>
        </div>
      </div>

      <div className="tr-tabs animate-in animate-in-delay-1">
        <button
          className={`tr-tab ${tab === 'incoming' ? 'active' : ''}`}
          onClick={() => setTab('incoming')}
        >
          <Inbox size={15} />
          נכנסות
          {pendingIncoming > 0 && (
            <span className="tr-badge">{pendingIncoming}</span>
          )}
        </button>
        <button
          className={`tr-tab ${tab === 'outgoing' ? 'active' : ''}`}
          onClick={() => setTab('outgoing')}
        >
          <ArrowUpFromLine size={15} />
          יוצאות
        </button>
      </div>

      {loading && showSkel ? (
        <div className="tr-list">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="tr-card skel" style={{ minHeight: 120 }} />
          ))}
        </div>
      ) : loading ? (
        null
      ) : list.length === 0 ? (
        <div className="tr-empty animate-in animate-in-delay-2">
          <ArrowLeftRight size={36} />
          <h3>
            {tab === 'incoming' ? 'אין העברות נכנסות' : 'לא ביצעת העברות יוצאות'}
          </h3>
          <p>
            {tab === 'incoming'
              ? 'כאשר סוכן אחר יעביר אליך נכס במערכת — הוא יופיע כאן.'
              : 'העבר נכס לסוכן אחר מעמוד הנכס, בכפתור "העבר נכס".'}
          </p>
        </div>
      ) : (
        <div className="tr-list animate-in animate-in-delay-2">
          {list.map((t) => {
            const other = t.direction === 'incoming' ? t.fromAgent : t.toAgent;
            const si = statusInfo(t.status);
            return (
              <div key={t.id} className={`tr-card tr-${si.tone}`}>
                <div className="tr-left">
                  <Link to={`/properties/${t.property.id}`} className="tr-property">
                    {t.property.images?.[0] ? (
                      <img src={t.property.images[0].url} alt="" />
                    ) : (
                      <div className="tr-property-ph"><Building2 size={20} /></div>
                    )}
                    <div className="tr-property-info">
                      <strong>{t.property.street}, {t.property.city}</strong>
                      <small>{t.property.type}</small>
                    </div>
                  </Link>
                </div>

                <div className="tr-middle">
                  <div className="tr-status">
                    <si.Icon size={13} />
                    {si.label}
                  </div>
                  {other ? (
                    <div className="tr-other">
                      {other.avatarUrl ? (
                        <img src={other.avatarUrl} alt="" />
                      ) : (
                        <span className="tr-other-ph">{(other.displayName || '?').charAt(0)}</span>
                      )}
                      <div className="tr-other-info">
                        <strong>
                          {t.direction === 'incoming' ? 'מאת ' : 'אל '}
                          {other.displayName || other.email}
                        </strong>
                        <small>
                          {other.agentProfile?.agency || other.email}
                        </small>
                      </div>
                    </div>
                  ) : t.status === 'WHATSAPP_SENT' ? (
                    <div className="tr-other tr-other-plain">
                      <MessageCircle size={16} />
                      <div className="tr-other-info">
                        <strong>נשלח בוואטסאפ</strong>
                        <small>ללא סוכן רשום</small>
                      </div>
                    </div>
                  ) : null}
                  {t.message && <p className="tr-message">“{t.message}”</p>}
                  <span className="tr-date" title={absoluteTime(t.createdAt)}>
                    {relativeTime(t.createdAt)}
                  </span>
                </div>

                <div className="tr-actions">
                  {t.direction === 'incoming' && t.status === 'PENDING' && (
                    <>
                      <button className="btn btn-primary btn-sm" onClick={() => handleAccept(t)}>
                        <Check size={14} /> אשר קבלה
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleDecline(t)}>
                        <XIcon size={14} /> דחה
                      </button>
                    </>
                  )}
                  {t.direction === 'outgoing' && t.status === 'PENDING' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => handleCancel(t)}>
                      <XIcon size={14} /> בטל בקשה
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
