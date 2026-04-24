import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Plus, Trash2, Pencil, Check, X as XIcon } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast, optimisticUpdate } from '../lib/toast';
import { displayText } from '../lib/display';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/ConfirmDialog';
// NeighborhoodPicker is available at merge from Agent G1 — used for
// multi-select across known neighborhoods. If it isn't loaded, the
// fallback <select multiple> below is reached via the `hasPicker` guard.
// TODO (Lane 9): drop the fallback once G1 ships in main.
import NeighborhoodPicker from '../components/NeighborhoodPicker';
import './NeighborhoodAdmin.css';

// G2 — admin page for NeighborhoodGroup (marketable areas like
// "צפון ישן תל אביב"). OWNER-only; plain agents bounce to /.
//
// Layout mirrors TagSettings: filter → inline create form → list of
// rows with edit-in-place + confirm-before-delete. Pre-linked by the
// H4 settings index (Agent 5).

const EMPTY_FORM = { name: '', description: '', memberIds: [] };

const hasPicker = typeof NeighborhoodPicker === 'function';

export default function NeighborhoodAdmin() {
  const { user } = useAuth();
  const toast = useToast();
  const [cities, setCities] = useState([]);
  const [selectedCity, setSelectedCity] = useState('');
  const [neighborhoods, setNeighborhoods] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // {id, name, description, memberIds}
  const [pendingDelete, setPendingDelete] = useState(null);

  // Load city list (distinct from all known neighborhoods). We don't
  // have a dedicated endpoint; the full list + dedupe in memory is
  // fine because G1 tops out at a couple hundred rows.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.listNeighborhoods();
        if (cancelled) return;
        const items = res?.items || [];
        const uniqueCities = Array.from(new Set(items.map((n) => n.city))).sort();
        setCities(uniqueCities);
        if (!selectedCity && uniqueCities.length) setSelectedCity(uniqueCities[0]);
      } catch {
        if (!cancelled) toast.error('שגיאה בטעינת הערים');
      }
    })();
    return () => { cancelled = true; };
    // Intentionally run once — city list is stable for the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Per-city data load. Swapping cities resets form + editing state so
  // a half-typed create on one city can't leak into another.
  const load = useCallback(async () => {
    if (!selectedCity) { setLoading(false); return; }
    setLoading(true);
    try {
      const [nbh, grp] = await Promise.all([
        api.listNeighborhoods({ city: selectedCity }),
        api.listNeighborhoodGroups({ city: selectedCity }),
      ]);
      setNeighborhoods(nbh?.items || []);
      setGroups(grp?.items || []);
    } catch {
      toast.error('שגיאה בטעינת הקבוצות');
    } finally {
      setLoading(false);
    }
  }, [selectedCity, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setForm(EMPTY_FORM); setEditing(null); }, [selectedCity]);

  const updateForm = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const neighborhoodsById = useMemo(() => {
    const m = new Map();
    neighborhoods.forEach((n) => m.set(n.id, n));
    return m;
  }, [neighborhoods]);

  // Picker works on names (shared with the agent-facing autocomplete).
  // Resolve names → ids via the loaded dictionary. Names not in the
  // dictionary are dropped silently — OWNER shouldn't be able to group
  // a neighborhood that doesn't exist in G1.
  const namesToIds = useCallback(
    (names) =>
      names
        .map((name) => neighborhoods.find((n) => n.name === name)?.id)
        .filter(Boolean),
    [neighborhoods],
  );
  const idsToNames = useCallback(
    (ids) =>
      ids
        .map((id) => neighborhoodsById.get(id)?.name)
        .filter(Boolean),
    [neighborhoodsById],
  );

  const handleCreate = async (e) => {
    e?.preventDefault?.();
    const name = form.name.trim();
    if (!name || !selectedCity) return;
    setSaving(true);
    try {
      await api.createNeighborhoodGroup({
        city: selectedCity,
        name,
        description: form.description.trim() || undefined,
        memberIds: form.memberIds,
      });
      toast.success('הקבוצה נוספה');
      setForm(EMPTY_FORM);
      await load();
    } catch {
      toast.error('יצירת הקבוצה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (group) => {
    setEditing({
      id: group.id,
      name: group.name,
      description: group.description || '',
      memberIds: (group.members || []).map((m) => m.neighborhoodId),
    });
  };
  const handleCancelEdit = () => setEditing(null);

  const handleSaveEdit = async () => {
    if (!editing?.id) return;
    try {
      await optimisticUpdate(toast, {
        label: 'שומר…',
        success: 'הקבוצה עודכנה',
        onSave: () => api.updateNeighborhoodGroup(editing.id, {
          name: editing.name.trim(),
          description: editing.description.trim() || null,
          memberIds: editing.memberIds,
        }),
      });
      setEditing(null);
      await load();
    } catch { /* toast handled */ }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    try {
      await optimisticUpdate(toast, {
        label: 'מוחק…',
        success: 'הקבוצה נמחקה',
        onSave: () => api.deleteNeighborhoodGroup(id),
      });
      await load();
    } catch { /* toast handled */ }
  };

  const renderMemberPicker = (names, onChange, id) => (
    hasPicker ? (
      <NeighborhoodPicker
        city={selectedCity}
        value={names}
        onChange={onChange}
        id={id}
      />
    ) : (
      // Fallback until NeighborhoodPicker lands.
      <select
        multiple
        className="nbhadmin-fallback"
        value={names}
        aria-label="שכונות"
        onChange={(e) => {
          const next = Array.from(e.target.selectedOptions).map((o) => o.value);
          onChange(next);
        }}
      >
        {neighborhoods.map((n) => (
          <option key={n.id} value={n.name}>{n.name}</option>
        ))}
      </select>
    )
  );

  // OWNER gate — the page is OWNER-only, but a silent redirect to
  // /dashboard felt like a broken link from Settings. Render an
  // in-place locked card with the requirement + a CTA to /office
  // where a user can create or join an office (and be promoted).
  if (user && user.role !== 'OWNER') {
    return (
      <div className="nbhadmin-page" dir="rtl" style={{ padding: 28 }}>
        <header className="nbhadmin-header">
          <div className="nbhadmin-title">
            <MapPin size={22} aria-hidden="true" />
            <h1>קבוצות שכונות</h1>
          </div>
        </header>
        <div style={{
          background: '#fff',
          border: '1px solid rgba(30,26,20,0.08)',
          borderRadius: 14,
          padding: 24,
          marginTop: 18,
          textAlign: 'center',
          fontFamily: 'Assistant, Heebo, -apple-system, sans-serif',
          color: '#1e1a14',
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 8px' }}>
            ניהול שכונות זמין לבעלי משרד בלבד
          </h2>
          <p style={{ fontSize: 14, color: '#6b6356', lineHeight: 1.7, margin: '0 0 16px' }}>
            כדי להגדיר קבוצות שכונות (למשל: "צפון ישן תל אביב") ולשתף אותן בין
            סוכני המשרד, יש ליצור משרד או להצטרף לאחד קיים. לאחר יצירת משרד
            תשודרג אוטומטית לתפקיד OWNER.
          </p>
          <Link
            to="/office"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'linear-gradient(180deg, #d9b774, #b48b4c)',
              color: '#1e1a14', padding: '9px 16px', borderRadius: 10,
              fontWeight: 800, fontSize: 13, textDecoration: 'none',
              boxShadow: '0 4px 10px rgba(180,139,76,0.3)',
            }}
          >
            לניהול המשרד
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="nbhadmin-page" dir="rtl">
      <header className="nbhadmin-header">
        <div className="nbhadmin-title">
          <MapPin size={22} aria-hidden="true" />
          <h1>קבוצות שכונות</h1>
        </div>
        <p className="nbhadmin-subtitle">
          ניהול אזורים שיווקיים המאגדים שכונות קיימות (לדוגמה: &quot;צפון ישן תל אביב&quot;).
        </p>
      </header>

      <section className="nbhadmin-filter" aria-label="בחירת עיר">
        <label className="nbhadmin-field">
          <span>עיר</span>
          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            aria-label="עיר"
          >
            {cities.length === 0 && <option value="">—</option>}
            {cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="nbhadmin-card" aria-label="קבוצה חדשה">
        <form className="nbhadmin-form" onSubmit={handleCreate}>
          <label className="nbhadmin-field nbhadmin-field-grow">
            <span>שם הקבוצה</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateForm('name', e.target.value)}
              placeholder="למשל: צפון ישן תל אביב"
              aria-label="שם הקבוצה"
              required
            />
          </label>
          <label className="nbhadmin-field nbhadmin-field-grow">
            <span>תיאור</span>
            <input
              type="text"
              value={form.description}
              onChange={(e) => updateForm('description', e.target.value)}
              placeholder="אופציונלי"
              aria-label="תיאור הקבוצה"
            />
          </label>
          <div className="nbhadmin-field nbhadmin-field-grow">
            <span>שכונות</span>
            {renderMemberPicker(
              idsToNames(form.memberIds),
              (names) => updateForm('memberIds', namesToIds(names)),
              'nbhadmin-new-members',
            )}
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving || !form.name.trim() || !selectedCity}
          >
            <Plus size={16} aria-hidden="true" />
            <span>{saving ? 'שומר…' : 'הוסף קבוצה'}</span>
          </button>
        </form>
      </section>

      <section
        className="nbhadmin-list"
        aria-label="רשימת קבוצות"
        aria-busy={loading ? 'true' : 'false'}
      >
        {loading && groups.length === 0 ? (
          <div className="nbhadmin-skel" aria-hidden />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={<MapPin size={40} />}
            title="עדיין אין קבוצות"
            description="צור/י קבוצה ראשונה בטופס שלמעלה כדי לאגד שכונות לאזור שיווקי."
          />
        ) : (
          <ul className="nbhadmin-rows">
            {groups.map((g) => {
              const isEditing = editing?.id === g.id;
              return (
                <li key={g.id} className="nbhadmin-row">
                  {isEditing ? (
                    <div className="nbhadmin-edit">
                      <input
                        className="nbhadmin-edit-name"
                        type="text"
                        value={editing.name}
                        onChange={(e) =>
                          setEditing((p) => ({ ...p, name: e.target.value }))
                        }
                        aria-label="שם קבוצה"
                      />
                      <input
                        className="nbhadmin-edit-desc"
                        type="text"
                        value={editing.description}
                        onChange={(e) =>
                          setEditing((p) => ({ ...p, description: e.target.value }))
                        }
                        aria-label="תיאור קבוצה"
                        placeholder="תיאור"
                      />
                      {renderMemberPicker(
                        idsToNames(editing.memberIds),
                        (names) => setEditing((p) => ({ ...p, memberIds: namesToIds(names) })),
                        `nbhadmin-edit-${g.id}`,
                      )}
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleSaveEdit}
                        aria-label="שמור"
                      >
                        <Check size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={handleCancelEdit}
                        aria-label="בטל עריכה"
                      >
                        <XIcon size={14} aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="nbhadmin-row-main">
                        <div className="nbhadmin-row-name">{displayText(g.name)}</div>
                        {g.description && (
                          <div className="nbhadmin-row-desc">{g.description}</div>
                        )}
                        <ul className="nbhadmin-chips" aria-label="שכונות בקבוצה">
                          {(g.members || []).map((m) => (
                            <li key={m.neighborhoodId} className="nbhadmin-chip">
                              <MapPin size={12} aria-hidden="true" />
                              <span>{m.neighborhood?.name || m.neighborhoodId}</span>
                            </li>
                          ))}
                          {(!g.members || g.members.length === 0) && (
                            <li className="nbhadmin-chip nbhadmin-chip-empty">
                              ללא שכונות
                            </li>
                          )}
                        </ul>
                      </div>
                      <div className="nbhadmin-actions">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => handleStartEdit(g)}
                          aria-label={`ערוך: ${g.name}`}
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost nbhadmin-delete"
                          onClick={() => setPendingDelete(g)}
                          aria-label={`מחק: ${g.name}`}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {pendingDelete && (
        <ConfirmDialog
          title="מחיקת קבוצה"
          message={`האם למחוק את הקבוצה "${pendingDelete.name}"? השכונות עצמן יישמרו.`}
          confirmLabel="מחק"
          onConfirm={handleDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
