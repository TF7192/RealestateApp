// Documents library — Sprint 6 port of the claude.ai/design bundle's
// documents surface. Cream/gold inline-style cards per uploaded file,
// mime-aware icons, tag chips, drag-and-drop upload zone up top.
//
// Distinct from PropertyImage (per-property gallery) and the signed
// Agreement flow (fileId on Agreement). This page is the generic
// catch-all "library" an agent keeps for pdfs, DWGs, xlsx reports and
// zip bundles of source documents.
//
// Filter pill row supports tag + kind. `all` for kind shows every
// mime family; `הכול` for tag shows rows regardless of label.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload, Trash2, Tag as TagIcon, FileText, FileSpreadsheet,
  FileArchive, FileCode, File as FileIcon, Sparkles, Download,
  Filter,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
  danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

const KIND_FILTERS = [
  { k: 'all',  label: 'הכול' },
  { k: 'pdf',  label: 'PDF' },
  { k: 'xlsx', label: 'Excel' },
  { k: 'dwg',  label: 'תוכניות (DWG)' },
  { k: 'zip',  label: 'קבצים דחוסים' },
];

// Icon picked by mime-family. lucide-react has a couple of file-typed
// icons — enough to differentiate pdf / spreadsheet / archive / DWG.
function iconForKind(kind) {
  switch (kind) {
    case 'pdf':  return FileText;
    case 'xlsx': return FileSpreadsheet;
    case 'zip':  return FileArchive;
    case 'dwg':  return FileCode;
    default:     return FileIcon;
  }
}

function prettyBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024)          return `${n} B`;
  if (n < 1024 * 1024)   return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function Documents() {
  const toast = useToast();
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind]       = useState('all');
  const [tagFilter, setTagFilter] = useState(''); // '' = all
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver]   = useState(false);
  const [tagsInput, setTagsInput] = useState('');
  const fileInputRef = useRef(null);

  // Stable ref so the load callback doesn't re-fire on every toast
  // object identity change (matches Reminders.jsx pattern).
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (kind && kind !== 'all') params.kind = kind;
      if (tagFilter) params.tag = tagFilter;
      const res = await api.listDocuments(params);
      setItems(res?.items || []);
    } catch {
      toastRef.current?.error?.('שגיאה בטעינת מסמכים');
    } finally {
      setLoading(false);
    }
  }, [kind, tagFilter]);

  useEffect(() => { load(); }, [load]);

  // All tags across the library — powers the tag pill row. Sorted by
  // usage count (descending) so the agent sees their most-used labels
  // on the left.
  const allTags = useMemo(() => {
    const freq = new Map();
    for (const d of items) {
      for (const t of d.tags || []) {
        freq.set(t, (freq.get(t) || 0) + 1);
      }
    }
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([t]) => t);
  }, [items]);

  const doUpload = useCallback(async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await api.uploadDocument(file, tags);
      toast.success('הקובץ הועלה');
      setTagsInput('');
      await load();
    } catch (e) {
      toast.error(e?.message || 'שגיאה בהעלאה');
    } finally {
      setUploading(false);
    }
  }, [load, tagsInput, toast]);

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) doUpload(file);
  };

  const onPick = (e) => {
    const file = e.target.files?.[0];
    if (file) doUpload(file);
    // Reset so picking the same file twice re-fires `change`.
    e.target.value = '';
  };

  const onDelete = async (id) => {
    const ok = window.confirm?.('למחוק את הקובץ?');
    if (!ok) return;
    try {
      await api.deleteDocument(id);
      setItems((p) => p.filter((d) => d.id !== id));
      toast.success('הקובץ נמחק');
    } catch (e) {
      toast.error(e?.message || 'שגיאה במחיקה');
    }
  };

  return (
    <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.ink, minHeight: '100%' }}>
      {/* Title row */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        marginBottom: 18, gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.7, margin: 0 }}>מסמכים</h1>
          <div style={{ fontSize: 13, color: DT.muted, marginTop: 2 }}>
            {items.length} קבצים · PDF / Excel / תוכניות / קבצים דחוסים
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
        }}
        style={{
          ...FONT,
          border: `2px dashed ${dragOver ? DT.gold : DT.borderStrong}`,
          background: dragOver ? DT.goldSoft : DT.cream4,
          borderRadius: 14,
          padding: 24,
          marginBottom: 16,
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        <Upload size={28} color={DT.gold} aria-hidden="true" />
        <div style={{ fontSize: 15, fontWeight: 800 }}>
          {uploading ? 'מעלה…' : 'גררו קובץ לכאן או לחצו לבחירה'}
        </div>
        <div style={{ fontSize: 12, color: DT.muted }}>
          PDF · DWG · ZIP · XLSX · עד 50MB
        </div>
        <input
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          placeholder="תגיות (מופרדות בפסיקים) — למשל: חוזים, סקרים"
          style={{
            ...FONT,
            background: DT.white, border: `1px solid ${DT.border}`,
            borderRadius: 10, padding: '8px 12px',
            fontSize: 12, color: DT.ink, textAlign: 'right',
            width: 'min(100%, 360px)', outline: 'none',
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          onChange={onPick}
          accept=".pdf,.dwg,.dxf,.zip,.rar,.7z,.xlsx,.xls,.csv,application/pdf,application/zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          style={{ display: 'none' }}
        />
      </div>

      {/* Filter pills — kind */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10, alignItems: 'center' }}>
        <Filter size={13} color={DT.muted} aria-hidden="true" />
        {KIND_FILTERS.map((f) => {
          const on = kind === f.k;
          return (
            <button
              key={f.k}
              type="button"
              onClick={() => setKind(f.k)}
              style={{
                ...FONT,
                background: on ? DT.ink : DT.white,
                color: on ? DT.cream : DT.ink,
                border: `1px solid ${on ? DT.ink : DT.border}`,
                padding: '6px 12px', borderRadius: 99,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >{f.label}</button>
          );
        })}
      </div>

      {/* Filter pills — tag. Only renders when at least one tag exists. */}
      {allTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'center' }}>
          <TagIcon size={13} color={DT.muted} aria-hidden="true" />
          <button
            type="button"
            onClick={() => setTagFilter('')}
            style={{
              ...FONT,
              background: tagFilter === '' ? DT.ink : DT.white,
              color: tagFilter === '' ? DT.cream : DT.ink,
              border: `1px solid ${tagFilter === '' ? DT.ink : DT.border}`,
              padding: '6px 12px', borderRadius: 99,
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >הכול</button>
          {allTags.map((t) => {
            const on = tagFilter === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTagFilter(on ? '' : t)}
                style={{
                  ...FONT,
                  background: on ? DT.gold : DT.goldSoft,
                  color: on ? DT.ink : DT.goldDark,
                  border: `1px solid ${on ? DT.gold : 'transparent'}`,
                  padding: '6px 12px', borderRadius: 99,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >#{t}</button>
            );
          })}
        </div>
      )}

      {/* Grid */}
      {loading && (
        <div style={{ padding: 40, textAlign: 'center', color: DT.muted, fontSize: 13 }}>
          טוען מסמכים…
        </div>
      )}
      {!loading && items.length === 0 && (
        <EmptyState onPick={() => fileInputRef.current?.click()} />
      )}
      {!loading && items.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 14,
        }}>
          {items.map((d) => (
            <DocumentCard key={d.id} doc={d} onDelete={() => onDelete(d.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentCard({ doc, onDelete }) {
  const Icon = iconForKind(doc.kind);
  return (
    <div style={{
      background: DT.white,
      border: `1px solid ${DT.border}`,
      borderRadius: 14,
      padding: 14,
      display: 'flex', flexDirection: 'column', gap: 10,
      boxShadow: '0 1px 2px rgba(30,26,20,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
          color: DT.ink, display: 'grid', placeItems: 'center',
          flexShrink: 0,
        }}><Icon size={22} aria-hidden="true" /></div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontWeight: 700, fontSize: 13, color: DT.ink,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }} title={doc.originalName}>
            {doc.originalName}
          </div>
          <div style={{ fontSize: 11, color: DT.muted, marginTop: 2 }}>
            {prettyBytes(doc.sizeBytes)}
            {' · '}
            {doc.createdAt
              ? new Date(doc.createdAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })
              : '—'}
          </div>
        </div>
      </div>

      {Array.isArray(doc.tags) && doc.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {doc.tags.map((t) => (
            <span key={t} style={{
              display: 'inline-flex', alignItems: 'center',
              background: DT.goldSoft, color: DT.goldDark,
              borderRadius: 99, fontWeight: 700, fontSize: 10,
              padding: '2px 8px',
            }}>#{t}</span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
        <a
          href={doc.url}
          target="_blank"
          rel="noopener noreferrer"
          download={doc.originalName}
          style={{
            ...FONT, flex: 1,
            background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
            border: 'none', color: DT.ink,
            padding: '7px 10px', borderRadius: 9, cursor: 'pointer',
            fontSize: 12, fontWeight: 800,
            display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'center',
            textDecoration: 'none',
          }}
        ><Download size={13} /> הורד</a>
        <button
          type="button"
          onClick={onDelete}
          aria-label="מחק מסמך"
          title="מחק"
          style={{
            ...FONT, background: DT.white, border: `1px solid ${DT.border}`,
            color: DT.danger, borderRadius: 9,
            padding: '7px 10px', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center',
          }}
        ><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

function EmptyState({ onPick }) {
  return (
    <div style={{
      padding: '48px 24px', textAlign: 'center', color: DT.muted,
      background: DT.white, border: `1px solid ${DT.border}`, borderRadius: 14,
    }}>
      <Sparkles size={28} style={{ color: DT.gold, marginBottom: 10 }} aria-hidden="true" />
      <div style={{ fontSize: 16, fontWeight: 800, color: DT.ink, marginBottom: 6 }}>
        עדיין אין מסמכים
      </div>
      <p style={{ fontSize: 13, margin: '0 0 16px', lineHeight: 1.7 }}>
        העלו חוזים, תוכניות DWG, דוחות Excel וקבצים דחוסים — כל מה שקשור לעסקה במקום אחד.
      </p>
      <button
        type="button"
        onClick={onPick}
        style={{
          ...FONT,
          background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
          border: 'none', color: DT.ink,
          padding: '9px 16px', borderRadius: 10, cursor: 'pointer',
          fontSize: 13, fontWeight: 800,
          display: 'inline-flex', gap: 6, alignItems: 'center',
        }}
      ><Upload size={14} /> העלו קובץ ראשון</button>
    </div>
  );
}
