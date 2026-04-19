import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Download, ArrowUp, ArrowDown, Users as UsersIcon, ChevronRight, ChevronLeft } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { relativeTime } from '../lib/time';
import './AdminUsers.css';

// Mirror of backend ADMIN_EMAILS so non-admins get bounced before the
// API call returns 403.
const ADMIN_EMAILS = new Set([
  'talfuks1234@gmail.com',
]);

const PAGE_SIZE = 50;

function roleLabel(role) {
  return { AGENT: 'סוכן', ADMIN: 'מנהל', CUSTOMER: 'לקוח' }[role] || role;
}

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('he-IL'); }
  catch { return '—'; }
}

// Tiny debounce hook — copied pattern from CommandPalette.
function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function AdminUsers() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('createdAt');
  const [dir, setDir] = useState('desc');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const debouncedSearch = useDebounced(search, 300);

  // Admin gate
  useEffect(() => {
    if (authLoading) return;
    if (!user || !ADMIN_EMAILS.has((user.email || '').toLowerCase())) {
      navigate('/', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.adminUsers({ page, pageSize: PAGE_SIZE, sort, dir, search: debouncedSearch });
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (e) {
      setErr(e?.message || 'טעינה נכשלה');
    } finally { setLoading(false); }
  }, [page, sort, dir, debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [debouncedSearch, sort, dir]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const onSort = (col) => {
    if (sort === col) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(col);
      // Sensible defaults: counts desc, name asc, dates desc.
      setDir(col === 'name' ? 'asc' : 'desc');
    }
  };

  const sortIcon = (col) => {
    if (sort !== col) return <ArrowUp size={11} className="au-sort-idle" />;
    return dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />;
  };

  const exportCsv = () => {
    // Build CSV from CURRENT page only — matches what the admin sees.
    // For full-export we'd need a stream endpoint; out of scope for the
    // first ship.
    const rows = [
      ['name', 'email', 'role', 'assets', 'leads', 'createdAt', 'lastActiveAt'],
      ...items.map((u) => [
        u.name, u.email, u.role, u.assetsCount, u.leadsCount,
        u.createdAt ?? '', u.lastActiveAt ?? '',
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => {
        const s = String(c ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `estia-users-page-${page}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="au-page">
      <header className="au-head">
        <div className="au-title">
          <UsersIcon size={20} />
          <h1>משתמשים</h1>
          <span className="au-total">{total.toLocaleString('he-IL')} סה״כ</span>
        </div>
        <div className="au-actions">
          <div className="au-search">
            <Search size={14} />
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חפש לפי שם או אימייל…"
            />
            {search && (
              <button onClick={() => setSearch('')} aria-label="נקה" type="button">
                <X size={14} />
              </button>
            )}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={items.length === 0}>
            <Download size={14} />
            ייצוא CSV
          </button>
        </div>
      </header>

      {err && <div className="au-err">{err}</div>}

      <div className="au-table-wrap">
        <table className="au-table">
          <thead>
            <tr>
              <th><button onClick={() => onSort('name')}>שם {sortIcon('name')}</button></th>
              <th>אימייל</th>
              <th>תפקיד</th>
              <th className="au-num"><button onClick={() => onSort('assetsCount')}>נכסים {sortIcon('assetsCount')}</button></th>
              <th className="au-num"><button onClick={() => onSort('leadsCount')}>לידים {sortIcon('leadsCount')}</button></th>
              <th><button onClick={() => onSort('createdAt')}>נוצר {sortIcon('createdAt')}</button></th>
              <th><button onClick={() => onSort('lastActiveAt')}>פעיל לאחרונה {sortIcon('lastActiveAt')}</button></th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="au-row au-skel">
                  {Array.from({ length: 7 }).map((__, j) => <td key={j}><span /></td>)}
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="au-empty">אין משתמשים בסינון הנוכחי</td></tr>
            ) : items.map((u) => (
              <tr key={u.id} className="au-row">
                <td className="au-name">{u.name}</td>
                <td className="au-email">{u.email}</td>
                <td>{roleLabel(u.role)}</td>
                <td className="au-num">{u.assetsCount.toLocaleString('he-IL')}</td>
                <td className="au-num">{u.leadsCount.toLocaleString('he-IL')}</td>
                <td className="au-muted">{fmtDate(u.createdAt)}</td>
                <td className="au-muted" title={u.lastActiveAt || ''}>
                  {u.lastActiveAt ? relativeTime(u.lastActiveAt) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="au-pager">
        <button
          className="btn btn-secondary btn-sm"
          disabled={page <= 1 || loading}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          aria-label="עמוד קודם"
        >
          <ChevronRight size={14} />
          הקודם
        </button>
        <span className="au-pager-info">
          עמוד {page} מתוך {totalPages}
        </span>
        <button
          className="btn btn-secondary btn-sm"
          disabled={page >= totalPages || loading}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          aria-label="עמוד הבא"
        >
          הבא
          <ChevronLeft size={14} />
        </button>
      </footer>
    </div>
  );
}
