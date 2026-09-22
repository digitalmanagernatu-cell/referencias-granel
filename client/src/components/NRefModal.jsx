import { useState, useEffect } from 'react';
import './NRefModal.css';

const API_BASE = import.meta.env.VITE_API_URL || '';
const PASSWORD = 'Toni2026';

export default function NRefModal({ referencia, onClose, onSuccess }) {
  const [step, setStep] = useState('password'); // 'password' | 'edit'
  const [password, setPassword] = useState('');
  const [nRef, setNRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handlePassword = (e) => {
    e.preventDefault();
    if (password === PASSWORD) {
      setStep('edit');
      setError('');
    } else {
      setError('Contraseña incorrecta');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = nRef.trim();
    if (!trimmed) { setError('El número de referencia no puede estar vacío.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/referencias/${referencia._sheetRow}/nref`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nRef: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');
      onSuccess(trimmed);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-nref" role="dialog" aria-modal="true" aria-labelledby="nref-title">
        <div className="modal-header">
          <h2 className="modal-title" id="nref-title">
            {step === 'password' ? 'Acceso restringido' : 'Asignar Nº Referencia'}
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        {step === 'password' ? (
          <form onSubmit={handlePassword}>
            <div className="modal-body">
              <p className="nref-producto">{referencia.nombreProducto}</p>
              <div className="form-group">
                <label className="form-label" htmlFor="nref-password">
                  Contraseña <span className="required">*</span>
                </label>
                <input
                  id="nref-password"
                  type="password"
                  className={`form-control${error ? ' error' : ''}`}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  autoFocus
                />
                {error && <span className="form-error">{error}</span>}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={!password}>
                Continuar
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <p className="nref-producto">{referencia.nombreProducto}</p>
              <div className="form-group">
                <label className="form-label" htmlFor="nref-value">
                  Nº Referencia <span className="required">*</span>
                </label>
                <input
                  id="nref-value"
                  type="text"
                  className={`form-control${error ? ' error' : ''}`}
                  value={nRef}
                  onChange={(e) => { setNRef(e.target.value); setError(''); }}
                  placeholder="Ej: GR-2026-001"
                  autoFocus
                />
                {error && <span className="form-error">{error}</span>}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving || !nRef.trim()}>
                {saving ? 'Guardando…' : 'Guardar referencia'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
