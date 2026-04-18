import { useEffect, useRef, useState } from 'react';
import {
  X,
  Upload,
  Star,
  Trash2,
  AlertCircle,
  ArrowUpToLine,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';
import api from '../lib/api';
import Portal from './Portal';
import './PropertyPhotoManager.css';

/**
 * PropertyPhotoManager
 *
 * Full-fidelity photo editor for a property:
 *  - Drag-in or click-to-upload
 *  - Grid of current photos with drag-to-reorder
 *  - "Set as cover" (moves to position 0)
 *  - Delete with optimistic UI
 *
 * Talks directly to the API so changes are live.
 */
export default function PropertyPhotoManager({ propertyId, initial = [], onClose, onChange }) {
  const [images, setImages] = useState(() => [...initial].sort((a, b) => a.sortOrder - b.sortOrder));
  const [uploading, setUploading] = useState(0);
  // Task 4 · optimistic thumbnails — created from the File objects the
  // instant the picker closes, so the user sees their photos *now* instead
  // of staring at an empty modal while HEIC→JPEG transcoding takes 3-5s.
  // Each entry is { id, url (object URL), pending: true }.
  const [pending, setPending] = useState([]);
  const [err, setErr] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    // Keep incoming order when `initial` changes
    setImages([...initial].sort((a, b) => a.sortOrder - b.sortOrder));
  }, [initial]);

  // Revoke object URLs on unmount so we don't leak blob memory.
  useEffect(() => () => {
    pending.forEach((p) => { try { URL.revokeObjectURL(p.url); } catch { /* ignore */ } });
  }, [pending]);

  const refreshFromServer = async () => {
    try {
      const r = await api.getProperty(propertyId);
      const next = r.property?.imageList || [];
      setImages([...next].sort((a, b) => a.sortOrder - b.sortOrder));
      onChange?.(next);
    } catch (_) { /* ignore */ }
  };

  const uploadOne = async (file, pendingId) => {
    if (!file.type.startsWith('image/') && !/\.heic$/i.test(file.name || '')) return;
    setUploading((n) => n + 1);
    setErr(null);
    try {
      await api.uploadPropertyImage(propertyId, file);
    } catch (e) {
      setErr(e.message || 'העלאה נכשלה');
    } finally {
      setUploading((n) => Math.max(0, n - 1));
      // Drop this pending thumb — it's either now backed by a real server
      // record (refreshFromServer will paint it) or it failed and the err
      // banner explains why.
      setPending((cur) => {
        const next = cur.filter((p) => p.id !== pendingId);
        const dropped = cur.find((p) => p.id === pendingId);
        if (dropped) { try { URL.revokeObjectURL(dropped.url); } catch { /* ignore */ } }
        return next;
      });
    }
  };

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    // Task 4 · seed optimistic thumbs BEFORE the HTTP request fires, so
    // Chrome has visible state-change on return from the file picker —
    // both a reassurance for the agent and a cue that focus returned.
    const seeded = files.map((file) => ({
      id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      url: URL.createObjectURL(file),
      name: file.name,
    }));
    setPending((cur) => [...cur, ...seeded]);
    // Upload sequentially so the server stays happy and ordering is predictable
    for (let i = 0; i < files.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await uploadOne(files[i], seeded[i].id);
    }
    await refreshFromServer();
  };

  const handleDelete = async (imgId) => {
    setBusy(true);
    setErr(null);
    // Optimistic
    const before = images;
    setImages((cur) => cur.filter((i) => i.id !== imgId));
    try {
      await api.deletePropertyImage(propertyId, imgId);
      await refreshFromServer();
    } catch (e) {
      setErr(e.message || 'מחיקה נכשלה');
      setImages(before);
    } finally {
      setBusy(false);
    }
  };

  const commitOrder = async (next) => {
    setBusy(true);
    setErr(null);
    try {
      await api.reorderPropertyImages(propertyId, next.map((i) => i.id));
      setImages(next.map((i, idx) => ({ ...i, sortOrder: idx })));
      onChange?.(next);
    } catch (e) {
      setErr(e.message || 'עדכון הסדר נכשל');
    } finally {
      setBusy(false);
    }
  };

  const handleSetCover = async (imgId) => {
    if (images[0]?.id === imgId) return;
    const target = images.find((i) => i.id === imgId);
    if (!target) return;
    const next = [target, ...images.filter((i) => i.id !== imgId)];
    setImages(next);
    await commitOrder(next);
  };

  // ── drag & drop between thumbs ──
  const onDragStart = (i) => (e) => {
    setDragIndex(i);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(i)); } catch { /* ignore */ }
  };
  const onDragOverItem = (i) => (e) => {
    e.preventDefault();
    if (i !== overIndex) setOverIndex(i);
  };
  const onDropItem = (i) => async (e) => {
    e.preventDefault();
    const from = dragIndex;
    setDragIndex(null);
    setOverIndex(null);
    if (from == null || from === i) return;
    const next = [...images];
    const [moved] = next.splice(from, 1);
    next.splice(i, 0, moved);
    setImages(next);
    await commitOrder(next);
  };

  // ── external file drag ──
  const onZoneDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };
  const onZoneDragLeave = () => setDragOver(false);
  const onZoneDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (files?.length) await handleFiles(files);
  };

  return (
    <Portal>
      <div className="ppm-backdrop" onClick={onClose}>
        <div className="ppm-modal" onClick={(e) => e.stopPropagation()}>
          <header className="ppm-header">
            <div>
              <h3>ניהול תמונות הנכס</h3>
              <p>{images.length} תמונות · גרור כדי לסדר · לחץ על ★ להגדרת תמונת השער</p>
            </div>
            <button className="btn-ghost" onClick={onClose} aria-label="סגור">
              <X size={18} />
            </button>
          </header>

          <div className="ppm-body">
            {err && (
              <div className="ppm-error">
                <AlertCircle size={14} />
                {err}
              </div>
            )}

            {/* Dropzone */}
            <div
              className={`ppm-dropzone ${dragOver ? 'is-over' : ''}`}
              onClick={() => fileInput.current?.click()}
              onDragOver={onZoneDragOver}
              onDragLeave={onZoneDragLeave}
              onDrop={onZoneDrop}
            >
              <div className="ppm-dropzone-inner">
                <div className="ppm-dropzone-icon">
                  {uploading > 0 ? <Loader2 size={28} className="ppm-spin" /> : <Upload size={28} />}
                </div>
                <strong>{uploading > 0 ? `מעלה ${uploading} תמונות…` : 'לחץ או גרור לכאן תמונות'}</strong>
                <span>JPG או PNG · ניתן לבחור מספר קבצים יחד</span>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/*,.heic,.heif"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  // Task 4 · defensively restore focus to the tab after
                  // the OS file picker closes. On macOS + Chrome there's
                  // a long-standing quirk where focus sometimes hands off
                  // to whichever app was behind Chrome instead of back to
                  // the tab that opened the picker. Explicit window.focus()
                  // is a best-effort nudge that's cheap to try and often
                  // succeeds — browsers allow it when it's the same event
                  // loop as a user gesture.
                  try { window.focus(); } catch { /* ignore */ }
                  const files = e.target.files;
                  // Reset the input value BEFORE firing uploads so the
                  // element isn't holding references while we upload;
                  // also lets the user re-select the same file later.
                  e.target.value = '';
                  handleFiles(files);
                }}
              />
            </div>

            {/* Task 4 · optimistic previews. Painted the moment the picker
                closes, replaced by the real server-backed thumbs once the
                upload + refresh finish. Having something on screen on return
                to Chrome also makes any lost-focus moment less confusing. */}
            {pending.length > 0 && (
              <ul className="ppm-grid ppm-grid-pending">
                {pending.map((p) => (
                  <li key={p.id} className="ppm-thumb ppm-thumb-pending">
                    <img src={p.url} alt={p.name} draggable={false} />
                    <div className="ppm-thumb-pending-overlay">
                      <Loader2 size={18} className="ppm-spin" />
                      <span>מעלה…</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Thumbs */}
            {images.length === 0 && pending.length === 0 ? (
              <div className="ppm-empty">
                <ImageIcon size={36} />
                <p>עדיין אין תמונות לנכס זה</p>
                <span>התמונה הראשונה שתעלה תשמש כתמונת השער</span>
              </div>
            ) : (
              <ul className="ppm-grid">
                {images.map((img, i) => (
                  <li
                    key={img.id}
                    className={`ppm-thumb ${i === 0 ? 'is-cover' : ''} ${dragIndex === i ? 'is-dragging' : ''} ${overIndex === i ? 'is-over' : ''}`}
                    draggable
                    onDragStart={onDragStart(i)}
                    onDragOver={onDragOverItem(i)}
                    onDrop={onDropItem(i)}
                    onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
                  >
                    <img src={img.url} alt={`תמונה ${i + 1}`} draggable={false} />
                    <div className="ppm-thumb-overlay">
                      {i === 0 ? (
                        <span className="ppm-cover-badge">
                          <Star size={12} fill="currentColor" />
                          תמונת שער
                        </span>
                      ) : (
                        <button
                          className="ppm-action-chip"
                          onClick={() => handleSetCover(img.id)}
                          disabled={busy}
                          title="קבע כתמונת שער"
                        >
                          <ArrowUpToLine size={13} />
                          הפוך לשער
                        </button>
                      )}
                      <button
                        className="ppm-action-chip danger"
                        onClick={() => handleDelete(img.id)}
                        disabled={busy}
                        title="מחק תמונה"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <span className="ppm-thumb-number">{i + 1}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <footer className="ppm-footer">
            <span className="ppm-footer-hint">שינויים נשמרים אוטומטית</span>
            <button className="btn btn-secondary" onClick={onClose}>
              סגור
            </button>
          </footer>
        </div>
      </div>
    </Portal>
  );
}
