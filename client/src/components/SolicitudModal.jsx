import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import './SolicitudModal.css';

const COMERCIALES = ['Toni', 'Mauro', 'Jaime', 'Internacional', 'España e Italia', 'España'];
const TIPOS = ['Normal', 'Nicho', 'Selecto', 'Body Mist', 'Exclusiva'];
const CATEGORIAS = ['Perfumería', 'Ambientación'];

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const INITIAL_FORM = {
  nombreComercial: '',
  nombreComercialCustom: '',
  nombreProducto: '',
  tipoProducto: '',
  categoria: '',
  peticionFechaLanzamiento: '',
  enlaces: '',
  nombreCliente: '',
};

const INITIAL_ERRORS = {};

const MAX_RETRIES = 5;
const RETRY_SECS = 15;

export default function SolicitudModal({ onClose, onSuccess }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState(INITIAL_ERRORS);
  const [submitting, setSubmitting] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState(0); // > 0 = waiting to retry

  const timerRef = useRef(null);
  const pendingRef = useRef(null); // { payload, attempt }

  const isOtroComercial = form.nombreComercial === 'otro';
  const isExclusiva = form.tipoProducto === 'Exclusiva';
  const isRetrying = retryCountdown > 0;

  // Cleanup interval on unmount
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // Close on Escape — blocked while retrying
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && !isRetrying) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, isRetrying]);

  const update = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const validate = () => {
    const newErrors = {};
    const comercialFinal = isOtroComercial ? form.nombreComercialCustom.trim() : form.nombreComercial;
    if (!comercialFinal) newErrors.nombreComercial = 'El nombre del comercial es obligatorio';
    if (!form.nombreProducto.trim()) newErrors.nombreProducto = 'El nombre de la fragancia es obligatorio';
    if (!form.tipoProducto) newErrors.tipoProducto = 'Selecciona un tipo de fragancia';
    if (!form.categoria) newErrors.categoria = 'Selecciona una categoría';
    if (isExclusiva && !form.nombreCliente.trim()) {
      newErrors.nombreCliente = 'El nombre del cliente es obligatorio para tipo Exclusiva';
    }
    if (form.enlaces.trim() && !isValidUrl(form.enlaces.trim())) {
      newErrors.enlaces = 'Introduce una URL válida (ej: https://www.fragrantica.es/...)';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const stopRetry = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRetryCountdown(0);
    pendingRef.current = null;
  };

  const scheduleRetry = (payload, attempt) => {
    pendingRef.current = { payload, attempt };
    let secs = RETRY_SECS;
    setRetryCountdown(secs);
    timerRef.current = setInterval(() => {
      secs--;
      setRetryCountdown(secs);
      if (secs <= 0) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        setRetryCountdown(0);
        doFetch(pendingRef.current.payload, pendingRef.current.attempt);
      }
    }, 1000);
  };

  const doFetch = async (payload, attempt) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/referencias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        const err = new Error(json.error || `Error ${res.status}`);
        err.httpStatus = res.status;
        throw err;
      }
      stopRetry();
      toast.success('Referencia añadida correctamente');
      onSuccess();
    } catch (err) {
      if (err.httpStatus === 423 && attempt < MAX_RETRIES) {
        scheduleRetry(payload, attempt + 1);
      } else {
        stopRetry();
        toast.error(`Error al guardar: ${err.message}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    stopRetry();
    const payload = {
      nombreComercial: isOtroComercial
        ? form.nombreComercialCustom.trim()
        : form.nombreComercial,
      nombreProducto: form.nombreProducto.trim(),
      tipoProducto: form.tipoProducto,
      categoria: form.categoria,
      peticionFechaLanzamiento: form.peticionFechaLanzamiento.trim(),
      enlaces: form.enlaces.trim(),
      nombreCliente: isExclusiva ? form.nombreCliente.trim() : '',
    };
    doFetch(payload, 0);
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !isRetrying && onClose()}>
      <div className="modal modal-solicitud" role="dialog" aria-modal="true" aria-labelledby="solicitud-title">
        <div className="modal-header">
          <h2 className="modal-title" id="solicitud-title">Solicitar nueva referencia</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar" disabled={submitting || isRetrying}>×</button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            <div className="solicitud-grid">

              {/* Nombre Comercial */}
              <div className="form-group">
                <label className="form-label" htmlFor="s-comercial">
                  Nombre Comercial <span className="required">*</span>
                </label>
                <select
                  id="s-comercial"
                  className={`form-control${errors.nombreComercial ? ' error' : ''}`}
                  value={form.nombreComercial}
                  onChange={(e) => update('nombreComercial', e.target.value)}
                  disabled={submitting}
                >
                  <option value="">Selecciona un comercial...</option>
                  {COMERCIALES.map((c) => <option key={c} value={c}>{c}</option>)}
                  <option value="otro">Otro...</option>
                </select>
                {errors.nombreComercial && <span className="form-error">{errors.nombreComercial}</span>}
              </div>

              {/* Campo libre para "otro" comercial */}
              {isOtroComercial && (
                <div className="form-group">
                  <label className="form-label" htmlFor="s-comercial-custom">
                    Nombre del comercial <span className="required">*</span>
                  </label>
                  <input
                    id="s-comercial-custom"
                    type="text"
                    className={`form-control${errors.nombreComercial ? ' error' : ''}`}
                    placeholder="Escribe el nombre..."
                    value={form.nombreComercialCustom}
                    onChange={(e) => update('nombreComercialCustom', e.target.value)}
                    disabled={submitting}
                    autoFocus
                  />
                </div>
              )}

              {/* Nombre de la fragancia */}
              <div className="form-group form-group-full">
                <label className="form-label" htmlFor="s-nombre">
                  Nombre de la fragancia <span className="required">*</span>
                </label>
                <input
                  id="s-nombre"
                  type="text"
                  className={`form-control${errors.nombreProducto ? ' error' : ''}`}
                  placeholder="Ej: Acqua di Gio..."
                  value={form.nombreProducto}
                  onChange={(e) => update('nombreProducto', e.target.value)}
                  disabled={submitting}
                />
                {errors.nombreProducto && <span className="form-error">{errors.nombreProducto}</span>}
              </div>

              {/* Tipo de fragancia */}
              <div className="form-group">
                <label className="form-label" htmlFor="s-tipo">
                  Tipo de fragancia <span className="required">*</span>
                </label>
                <select
                  id="s-tipo"
                  className={`form-control${errors.tipoProducto ? ' error' : ''}`}
                  value={form.tipoProducto}
                  onChange={(e) => update('tipoProducto', e.target.value)}
                  disabled={submitting}
                >
                  <option value="">Selecciona un tipo...</option>
                  {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                {errors.tipoProducto && <span className="form-error">{errors.tipoProducto}</span>}
              </div>

              {/* Categoría */}
              <div className="form-group">
                <label className="form-label" htmlFor="s-categoria">
                  Categoría <span className="required">*</span>
                </label>
                <select
                  id="s-categoria"
                  className={`form-control${errors.categoria ? ' error' : ''}`}
                  value={form.categoria}
                  onChange={(e) => update('categoria', e.target.value)}
                  disabled={submitting}
                >
                  <option value="">Selecciona una categoría...</option>
                  {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                {errors.categoria && <span className="form-error">{errors.categoria}</span>}
              </div>

              {/* Mes de lanzamiento */}
              <div className="form-group">
                <label className="form-label" htmlFor="s-mes-lanzamiento">
                  Mes de lanzamiento <span className="optional">(opcional)</span>
                </label>
                <select
                  id="s-mes-lanzamiento"
                  className="form-control"
                  value={form.peticionFechaLanzamiento}
                  onChange={(e) => update('peticionFechaLanzamiento', e.target.value)}
                  disabled={submitting}
                >
                  <option value="">Selecciona un mes...</option>
                  {MESES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {/* Enlace a Fragrantica */}
              <div className="form-group form-group-full">
                <label className="form-label" htmlFor="s-enlace">
                  Enlace a Fragrantica <span className="optional">(opcional)</span>
                </label>
                <input
                  id="s-enlace"
                  type="url"
                  className={`form-control${errors.enlaces ? ' error' : ''}`}
                  placeholder="https://www.fragrantica.es/perfume/..."
                  value={form.enlaces}
                  onChange={(e) => update('enlaces', e.target.value)}
                  disabled={submitting}
                />
                {errors.enlaces && <span className="form-error">{errors.enlaces}</span>}
              </div>

              {/* Nombre del cliente (solo si Exclusiva) */}
              {isExclusiva && (
                <div className="form-group form-group-full solicitud-conditional">
                  <div className="conditional-header">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    Campo requerido para tipo Exclusiva
                  </div>
                  <label className="form-label" htmlFor="s-cliente">
                    Nombre del cliente <span className="required">*</span>
                  </label>
                  <input
                    id="s-cliente"
                    type="text"
                    className={`form-control${errors.nombreCliente ? ' error' : ''}`}
                    placeholder="Nombre del cliente exclusivo..."
                    value={form.nombreCliente}
                    onChange={(e) => update('nombreCliente', e.target.value)}
                    disabled={submitting}
                    autoFocus
                  />
                  {errors.nombreCliente && <span className="form-error">{errors.nombreCliente}</span>}
                </div>
              )}
            </div>
          </div>

          {isRetrying && (
            <div className="retry-notice">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              Archivo en uso. Reintentando en {retryCountdown}s…
              (intento {pendingRef.current?.attempt ?? 0}/{MAX_RETRIES})
              <button type="button" className="retry-cancel" onClick={stopRetry}>
                Cancelar
              </button>
            </div>
          )}

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-outline"
              onClick={onClose}
              disabled={submitting || isRetrying}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || isRetrying}
            >
              {submitting ? (
                <>
                  <span className="btn-spinner" />
                  Guardando...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Enviar solicitud
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Helper ─────────────────────────────────────────────────────────────────
function isValidUrl(str) {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
