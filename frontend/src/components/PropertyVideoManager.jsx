import { useEffect, useRef, useState } from 'react';
import { X, Upload, Link2, Trash2, Film, AlertCircle, Play } from 'lucide-react';
import api from '../lib/api';
import Portal from './Portal';
import './PropertyVideoManager.css';

export default function PropertyVideoManager({ propertyId, initial = [], onClose, onChange }) {
  const [videos, setVideos] = useState(() => [...initial].sort((a, b) => a.sortOrder - b.sortOrder));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [progress, setProgress] = useState(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const fileInput = useRef(null);

  useEffect(() => {
    setVideos([...initial].sort((a, b) => a.sortOrder - b.sortOrder));
  }, [initial]);

  const refresh = async () => {
    try {
      const r = await api.listPropertyVideos(propertyId);
      setVideos(r.videos || []);
      onChange?.(r.videos || []);
    } catch { /* ignore */ }
  };

  const handleUpload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setErr('אפשר להעלות רק קבצי וידאו');
      return;
    }
    setErr(null);
    setBusy(true);
    setProgress(0);
    try {
      await api.uploadPropertyVideo(propertyId, file, (p) => setProgress(p));
      await refresh();
    } catch (e) {
      setErr(e.message || 'העלאה נכשלה');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const handleExternal = async () => {
    if (!url.trim()) {
      setErr('יש להזין קישור');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.addExternalVideo(propertyId, { url: url.trim(), title: title.trim() || null });
      setUrl('');
      setTitle('');
      await refresh();
    } catch (e) {
      setErr(e.message || 'הוספה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (videoId) => {
    setBusy(true);
    setErr(null);
    const before = videos;
    setVideos((cur) => cur.filter((v) => v.id !== videoId));
    try {
      await api.deletePropertyVideo(propertyId, videoId);
      await refresh();
    } catch (e) {
      setErr(e.message || 'מחיקה נכשלה');
      setVideos(before);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Portal>
      <div className="pvm-backdrop" onClick={onClose}>
        <div className="pvm-modal" onClick={(e) => e.stopPropagation()}>
          <header className="pvm-header">
            <div>
              <h3>ניהול סרטונים</h3>
              <p>{videos.length} סרטונים · העלאה עד 100MB או קישור חיצוני</p>
            </div>
            <button className="btn-ghost" onClick={onClose} aria-label="סגור"><X size={18} /></button>
          </header>

          <div className="pvm-body">
            {err && <div className="pvm-error"><AlertCircle size={14} />{err}</div>}

            {/* Upload flow */}
            <section className="pvm-section">
              <h4>העלאת סרטון מהמכשיר</h4>
              <div
                className="pvm-dropzone"
                onClick={() => fileInput.current?.click()}
              >
                <div className="pvm-dz-icon">
                  {progress == null ? <Upload size={24} /> : <Film size={24} />}
                </div>
                <strong>
                  {progress == null ? 'לחץ לבחירת סרטון' : `מעלה… ${progress}%`}
                </strong>
                <span>MP4 / MOV · עד 100MB</span>
                {progress != null && (
                  <div className="pvm-progress">
                    <div className="pvm-progress-bar" style={{ width: `${progress}%` }} />
                  </div>
                )}
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="video/*"
                style={{ display: 'none' }}
                onChange={(e) => { handleUpload(e.target.files?.[0]); e.target.value = ''; }}
              />
            </section>

            {/* External URL flow */}
            <section className="pvm-section">
              <h4>או הוסף קישור ל-YouTube / Vimeo / Drive</h4>
              <div className="pvm-form">
                <label>
                  <span>קישור</span>
                  <div className="pvm-input-icon">
                    <Link2 size={14} />
                    <input
                      type="url"
                      placeholder="https://youtu.be/..."
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                    />
                  </div>
                </label>
                <label>
                  <span>שם (אופציונלי)</span>
                  <input
                    type="text"
                    placeholder="סיור וירטואלי"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <button className="btn btn-primary" onClick={handleExternal} disabled={busy}>
                  <Link2 size={14} />
                  הוסף קישור
                </button>
              </div>
            </section>

            {/* Existing videos */}
            {videos.length > 0 && (
              <section className="pvm-section">
                <h4>סרטונים קיימים</h4>
                <ul className="pvm-list">
                  {videos.map((v) => (
                    <li key={v.id} className={`pvm-item pvm-${v.kind}`}>
                      <div className="pvm-preview">
                        {v.kind === 'upload' ? (
                          <video src={v.url} preload="metadata" muted playsInline />
                        ) : (
                          <ExternalThumb url={v.url} />
                        )}
                        <span className="pvm-play"><Play size={16} fill="#fff" /></span>
                      </div>
                      <div className="pvm-info">
                        <strong>{v.title || (v.kind === 'upload' ? 'סרטון' : 'קישור חיצוני')}</strong>
                        <small>
                          {v.kind === 'external'
                            ? v.url
                            : v.sizeBytes
                            ? `${(v.sizeBytes / 1024 / 1024).toFixed(1)}MB · ${v.mimeType || 'video'}`
                            : v.mimeType || 'video'}
                        </small>
                      </div>
                      <button
                        className="pvm-del"
                        onClick={() => handleDelete(v.id)}
                        disabled={busy}
                        aria-label="מחק"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}

function ExternalThumb({ url }) {
  // Quick YouTube thumbnail guess
  const ytId = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/embed\/)([\w-]{11})/)?.[1];
  if (ytId) {
    return <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt="" />;
  }
  const vimeoId = url.match(/vimeo\.com\/(\d+)/)?.[1];
  if (vimeoId) {
    return <div className="pvm-ext-thumb vimeo">Vimeo</div>;
  }
  return <div className="pvm-ext-thumb">VIDEO</div>;
}
