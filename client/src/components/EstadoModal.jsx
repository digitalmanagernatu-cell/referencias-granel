import { useState, useEffect } from 'react';
import './EstadoModal.css';

const API_BASE = import.meta.env.VITE_API_URL || '';
const PASSWORD = 'Toni2026';
const ESTADOS = ['PENDIENTE', 'EVALUANDO', 'TESTANDO', 'APROBADO', 'RECHAZADO', 'DESCARTADO'];

export default function EstadoModal({ referencia, onClose, onSuccess }) {
  const [step, setStep] = useState('password');
  const [password, setPassword] = useState('');
  const [estado, setEstado] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handlePassword = (e) => {
    e.preventDefault();
    if (password === PASSWORD) { setStep('edit'); setError(''); }
    else setError('Contraseña incorrecta');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!estado) { setError('Selecciona un estado'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/referencias/${referencia._sheetRow}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estado,
          estadoAnterior: referencia.estado || '',
          referencia,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');
      onSuccess(estado);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-estado" role="dialog" aria-modal="true" aria-labelledby="estado-title">
        <div className="modal-header">
          <h2 className="modal-title" id="estado-title">
            {step === 'password' ? 'Acceso restringido' : 'Cambiar estado'}
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        {step === 'password' ? (
          <form onSubmit={handlePassword}>
            <div className="modal-body">
              <p className="estado-producto">{referencia.nombreProducto}</p>
              <div className="form-group">
                <label className="form-label" htmlFor="estado-password">
                  Contraseña <span className="required">*</span>
                </label>
                <input
                  id="estado-password"
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
              <button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={!password}>Continuar</button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <p className="estado-producto">{referencia.nombreProducto}</p>
              {referencia.estado && (
                <p className="estado-actual">
                  Estado actual: <strong>{referencia.estado}</strong>
                </p>
              )}
              <div className="form-group">
                <label className="form-label" htmlFor="estado-select">
                  Nuevo estado <span className="required">*</span>
                </label>
                <select
                  id="estado-select"
                  className={`form-control${error ? ' error' : ''}`}
                  value={estado}
                  onChange={(e) => { setEstado(e.target.value); setError(''); }}
                  autoFocus
                >
                  <option value="">— Selecciona —</option>
                  {ESTADOS.filter(e => e !== (referencia.estado || '').toUpperCase()).map(e => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
                {error && <span className="form-error">{error}</span>}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving || !estado}>
                {saving ? 'Guardando…' : 'Guardar estado'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
