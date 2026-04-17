import { useOutletContext, Link } from 'react-router-dom';
import {
  LogOut, User, Bell, Shield, Sparkles, ChevronLeft, Mail, Phone,
  Building2, Award, Users, Moon,
} from 'lucide-react';
import { agentProfile } from '../../data/mockData';
import { haptics, isNative, removeItem, Keys } from '../../native';

export default function MobileSettings() {
  const { onLogout } = useOutletContext() || {};
  const platform = isNative() ? 'אפליקציה' : 'דפדפן';

  const handleLogout = async () => {
    haptics.warn();
    await removeItem(Keys.AUTH_USER);
    onLogout?.();
  };

  return (
    <div className="m-page m-stagger">
      <div className="m-settings-profile">
        <div className="m-settings-avatar">{agentProfile.name.charAt(0)}</div>
        <div className="m-settings-name">{agentProfile.name}</div>
        <div className="m-settings-role">
          <Award size={12} />
          {agentProfile.title} · {agentProfile.agency}
        </div>
        <div className="m-settings-lic">רישיון {agentProfile.license}</div>
      </div>

      <section className="m-settings-group">
        <div className="m-settings-group-label">חשבון</div>
        <Link to="#" className="m-settings-row" onClick={() => haptics.tap()}>
          <User size={18} />
          <div>
            <div>פרופיל סוכן</div>
            <div className="m-settings-row-sub">{agentProfile.name}</div>
          </div>
          <ChevronLeft size={16} />
        </Link>
        <Link to="#" className="m-settings-row" onClick={() => haptics.tap()}>
          <Mail size={18} />
          <div>
            <div>אימייל</div>
            <div className="m-settings-row-sub" style={{ direction: 'ltr', textAlign: 'right' }}>{agentProfile.email}</div>
          </div>
          <ChevronLeft size={16} />
        </Link>
        <Link to="#" className="m-settings-row" onClick={() => haptics.tap()}>
          <Phone size={18} />
          <div>
            <div>טלפון</div>
            <div className="m-settings-row-sub" style={{ direction: 'ltr', textAlign: 'right' }}>{agentProfile.phone}</div>
          </div>
          <ChevronLeft size={16} />
        </Link>
      </section>

      <section className="m-settings-group">
        <div className="m-settings-group-label">העדפות</div>
        <Link to="#" className="m-settings-row" onClick={() => haptics.tap()}>
          <Bell size={18} />
          <div>התראות</div>
          <ChevronLeft size={16} />
        </Link>
        <Link to="#" className="m-settings-row" onClick={() => haptics.tap()}>
          <Moon size={18} />
          <div>
            <div>ערכת נושא</div>
            <div className="m-settings-row-sub">כהה</div>
          </div>
          <ChevronLeft size={16} />
        </Link>
        <Link to="#" className="m-settings-row" onClick={() => haptics.tap()}>
          <Shield size={18} />
          <div>פרטיות וביטחון</div>
          <ChevronLeft size={16} />
        </Link>
      </section>

      <section className="m-settings-group">
        <div className="m-settings-group-label">המשרד שלי</div>
        <Link to="#" className="m-settings-row" onClick={() => haptics.tap()}>
          <Building2 size={18} />
          <div>פרטי סוכנות</div>
          <ChevronLeft size={16} />
        </Link>
        <Link to="#" className="m-settings-row" onClick={() => haptics.tap()}>
          <Users size={18} />
          <div>חברי צוות</div>
          <ChevronLeft size={16} />
        </Link>
      </section>

      <button className="m-settings-logout" onClick={handleLogout}>
        <LogOut size={18} />
        יציאה
      </button>

      <div className="m-settings-footer">
        <span className="m-login-diamond" style={{ width: 18, height: 18, fontSize: 10, borderRadius: 5 }}>◆</span>
        <span>Estia · {platform}</span>
        <span>·</span>
        <span>גרסה 1.0</span>
      </div>

      <style>{`
        .m-settings-profile {
          display: flex; flex-direction: column; align-items: center;
          padding: 32px 20px; text-align: center; gap: 4px;
        }
        .m-settings-avatar {
          width: 88px; height: 88px; border-radius: 50%;
          background: linear-gradient(145deg, var(--gold-light), var(--gold-dim));
          color: var(--bg-primary); display: grid; place-items: center;
          font-family: var(--font-display); font-size: 34px;
          box-shadow: 0 12px 34px rgba(201, 169, 110, 0.3);
          margin-bottom: 14px;
        }
        .m-settings-name {
          font-family: var(--font-display); font-size: 24px;
          color: var(--text-primary); letter-spacing: -0.3px;
        }
        .m-settings-role {
          display: inline-flex; gap: 5px; align-items: center;
          font-size: 12.5px; color: var(--gold-light);
          letter-spacing: 0.3px; margin-top: 4px;
        }
        .m-settings-lic {
          font-size: 11px; color: var(--text-muted);
          letter-spacing: 0.6px; text-transform: uppercase; margin-top: 4px;
        }
        .m-settings-group {
          background: var(--bg-card); border: 1px solid var(--m-hairline);
          border-radius: var(--m-radius-md); overflow: hidden;
          margin-top: 20px;
        }
        .m-settings-group-label {
          font-size: 10px; text-transform: uppercase;
          letter-spacing: 0.8px; color: var(--text-muted);
          padding: 12px 18px 8px; font-weight: 600;
          border-bottom: 1px solid var(--m-hairline);
        }
        .m-settings-row {
          display: flex; align-items: center; gap: 14px;
          padding: 14px 18px; color: var(--text-primary);
          font-family: var(--font-body); font-size: 14.5px; text-decoration: none;
          border-bottom: 1px solid var(--m-hairline);
          transition: background 0.2s;
        }
        .m-settings-row:last-child { border-bottom: none; }
        .m-settings-row:active { background: rgba(255,255,255,0.03); }
        .m-settings-row > div { flex: 1; }
        .m-settings-row svg:first-child { color: var(--gold); flex-shrink: 0; }
        .m-settings-row svg:last-child { color: var(--text-muted); flex-shrink: 0; }
        .m-settings-row-sub {
          font-size: 12px; color: var(--text-muted); margin-top: 2px;
        }
        .m-settings-logout {
          width: 100%; margin-top: 28px;
          padding: 16px; background: rgba(248,113,113,0.08);
          color: var(--danger); border: 1px solid rgba(248,113,113,0.2);
          border-radius: var(--m-radius-md); font-family: var(--font-body);
          font-size: 14.5px; font-weight: 500; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        }
        .m-settings-logout:active { background: rgba(248,113,113,0.15); transform: scale(0.99); }
        .m-settings-footer {
          display: flex; justify-content: center; align-items: center; gap: 6px;
          margin-top: 22px; padding-bottom: 20px;
          font-size: 10.5px; color: var(--text-muted); letter-spacing: 0.3px;
        }
      `}</style>
    </div>
  );
}
