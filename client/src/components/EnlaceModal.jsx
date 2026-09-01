import { useState, useEffect } from 'react';
import './EnlaceModal.css';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function EnlaceModal({ referencia, onClose, onSuccess }) {
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) { setError('La URL no puede estar vacía.'); return; }
    if (!/^https?:\/\//i.test(trimmed)) { setError('La URL debe comenzar con http:// o https://'); return; }

    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/referencias/${referencia._sheetRow}/enlace`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enlace: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar el enlace');
      onSuccess(trimmed);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-enlace" role="dialog" aria-modal="true" aria-labelledby="enlace-title">
        <div className="modal-header">
          <h2 className="modal-title" id="enlace-title">Añadir enlace Fragrantica</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="enlace-producto">{referencia.nombreProducto}</p>
            <div className="form-group">
              <label className="form-label" htmlFor="enlace-url">
                URL de Fragrantica <span className="required">*</span>
              </label>
              <input
                id="enlace-url"
                type="url"
                className={`form-control${error ? ' error' : ''}`}
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(''); }}
                placeholder="https://www.fragrantica.es/perfume/..."
                autoFocus
              />
              {error && <span className="form-error">{error}</span>}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || !url.trim()}>
              {saving ? 'Guardando…' : 'Guardar enlace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
