import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import './SolicitudModal.css';

const COMERCIALES = ['TONI', 'MAURO', 'JAIME', 'LABORATORIO'];
const TIPOS = ['NORMAL', 'NICHO', 'SELECTO', 'BODY MIST', 'EXCLUSIVA', 'DIVAIN'];
const TIPO_FRAGANCIA = ['FEMENINO', 'MASCULINO', 'UNISEX'];
const CATEGORIAS = ['PERFUMERÍA', 'AMBIENTACIÓN'];

const INITIAL_FORM = {
  nombreComercial: '',
  nombreComercialCustom: '',
  nombreProducto: '',
  tipoProducto: '',
  tipoFragancia: '',
  categoria: '',
  peticionFechaLanzamiento: '',
  enlaces: '',
  nombreCliente: '',
};

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function mightBeDuplicate(nameA, nameB) {
  const a = normalize(nameA);
  const b = normalize(nameB);
  if (!a || !b || a.length < 5 || b.length < 5) return false;
  const shorter = a.length <= b.length ? a : b;
  const longer  = a.length <= b.length ? b : a;
  return longer.includes(shorter) && shorter.length >= 5;
}

function sameUrl(urlA, urlB) {
  if (!urlA || !urlB) return false;
  try {
    return new URL(urlA).pathname.toLowerCase() === new URL(urlB).pathname.toLowerCase();
  } catch { return false; }
}

export default function SolicitudModal({ onClose, onSuccess, referencias = [] }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [skipDuplicateCheck, setSkipDuplicateCheck] = useState(false);

  const isOtroComercial = form.nombreComercial === 'otro';
  const isExclusiva = form.tipoProducto === 'EXCLUSIVA';

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    setDuplicateWarning(null);
    setSkipDuplicateCheck(false);
  }, [form.nombreProducto, form.enlaces]);

  const update = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const validate = () => {
    const newErrors = {};
    const comercialFinal = isOtroComercial ? form.nombreComercialCustom.trim() : form.nombreComercial;
    if (!comercialFinal) newErrors.nombreComercial = 'El nombre del comercial es obligatorio';
    if (!form.nombreProducto.trim()) newErrors.nombreProducto = 'El nombre de la fragancia es obligatorio';
    if (!form.tipoProducto) newErrors.tipoProducto = 'Selecciona un tipo de producto';
    if (!form.tipoFragancia) newErrors.tipoFragancia = 'Selecciona el género de la fragancia';
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

  function findSimilar(nombre, enlace) {
    for (const ref of referencias) {
      if (mightBeDuplicate(nombre, ref.nombreProducto)) {
        return { ref, reason: `nombre similar a "${ref.nombreProducto}"` };
      }
      if (enlace && sameUrl(enlace, ref.enlaces)) {
        return { ref, reason: 'mismo enlace de Fragrantica' };
      }
    }
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const nombre = form.nombreProducto.trim();
    const enlace = form.enlaces.trim();

    if (!skipDuplicateCheck) {
      const similar = findSimilar(nombre, enlace);
      if (similar) {
        setDuplicateWarning(similar);
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        nombreComercial: isOtroComercial ? form.nombreComercialCustom.trim() : form.nombreComercial,
        nombreProducto: nombre,
        tipoProducto: form.tipoProducto,
        tipoFragancia: form.tipoFragancia,
        categoria: form.categoria,
        peticionFechaLanzamiento: form.peticionFechaLanzamiento.trim() || 'NO INDICADO',
        enlaces: enlace,
        nombreCliente: isExclusiva ? form.nombreCliente.trim() : '',
      };

      const res = await fetch('/api/referencias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setErrors({ nombreProducto: json.error || 'Esta referencia ya está solicitada' });
          return;
        }
        throw new Error(json.error || `Error ${res.status}`);
      }

      toast.success('Referencia añadida correctamente');
      onSuccess();
    } catch (err) {
      toast.error(`Error al guardar: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMerge = async () => {
    if (!duplicateWarning) return;
    setSubmitting(true);
    try {
      const newCliente = isExclusiva
        ? form.nombreCliente.trim()
        : (form.nombreComercial === 'otro' ? form.nombreComercialCustom.trim() : '');
      const sheetRow = duplicateWarning.ref._sheetRow;

      const res = await fetch(`/api/referencias/${sheetRow}/merge-cliente`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nuevoCliente: newCliente || 'NATU',
          nombreProducto: form.nombreProducto.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`);

      toast.success('Solicitud registrada como cliente adicional en la referencia existente');
      onSuccess();
    } catch (err) {
      toast.error(`Error al combinar: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDifferent = () => {
    setDuplicateWarning(null);
    setSkipDuplicateCheck(true);
    setTimeout(() => {
      document.getElementById('solicitud-submit-btn')?.click();
    }, 50);
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-solicitud" role="dialog" aria-modal="true" aria-labelledby="solicitud-title">
        <div className="modal-header">
          <h2 className="modal-title" id="solicitud-title">Solicitar nueva referencia</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar" disabled={submitting}>×</button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            {duplicateWarning && (
              <div className="duplicate-warning">
                <div className="duplicate-warning-icon">⚠️</div>
                <div className="duplicate-warning-body">
                  <p className="duplicate-warning-title">Posible referencia duplicada</p>
                  <p className="duplicate-warning-text">
                    Ya existe una referencia con {duplicateWarning.reason}:{' '}
                    <strong>{duplicateWarning.ref.nombreProducto}</strong>
                    {duplicateWarning.ref.nombreCliente && ` (cliente: ${duplicateWarning.ref.nombreCliente})`}.
                  </p>
                  <p className="duplicate-warning-text">¿Es la misma fragancia con un cliente diferente, o es una fragancia distinta?</p>
                  <div className="duplicate-warning-actions">
                    <button type="button" className="btn btn-warning" onClick={handleMerge} disabled={submitting}>
                      Es la misma — añadir como cliente adicional
                    </button>
                    <button type="button" className="btn btn-outline" onClick={handleDifferent} disabled={submitting}>
                      No, es diferente — continuar
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="solicitud-grid">
              {/* Nombre Comercial */}
              <div className="form-group">
                <label className="form-label" htmlFor="s-comercial">
                  Nombre Solicitante <span className="required">*</span>
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

              {isOtroComercial && (
                <div className="form-group">
                  <label className="form-label" htmlFor="s-comercial-custom">
                    Nombre <span className="required">*</span>
                  </label>
                  <input
                    id="s-comercial-custom"
                    type="text"
                    className={`form-control${errors.nombreComercial ? ' error' : ''}`}
                    placeholder="Escribe el nombre..."
                    value={form.nombreComercialCustom}
                    onChange={(e) => update('nombreComercialCustom', e.target.value.toUpperCase())}
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

              {/* Tipo de producto */}
              <div className="form-group">
                <label className="form-label" htmlFor="s-tipo">
                  Tipo de producto <span className="required">*</span>
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

              {/* Tipo de fragancia */}
              <div className="form-group">
                <label className="form-label" htmlFor="s-tipo-fragancia">
                  Tipo fragancia <span className="required">*</span>
                </label>
                <select
                  id="s-tipo-fragancia"
                  className={`form-control${errors.tipoFragancia ? ' error' : ''}`}
                  value={form.tipoFragancia}
                  onChange={(e) => update('tipoFragancia', e.target.value)}
                  disabled={submitting}
                >
                  <option value="">Selecciona género...</option>
                  {TIPO_FRAGANCIA.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                {errors.tipoFragancia && <span className="form-error">{errors.tipoFragancia}</span>}
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

              {/* Solicitud Fecha Lanzamiento */}
              <div className="form-group">
                <label className="form-label" htmlFor="s-fecha-lanzamiento">
                  Solicitud fecha lanzamiento <span className="optional">(opcional)</span>
                </label>
                <input
                  id="s-fecha-lanzamiento"
                  type="text"
                  className="form-control"
                  placeholder="Ej: Mayo 2026"
                  value={form.peticionFechaLanzamiento}
                  onChange={(e) => update('peticionFechaLanzamiento', e.target.value)}
                  disabled={submitting}
                />
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

          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <button
              id="solicitud-submit-btn"
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting ? (
                <><span className="btn-spinner" />Guardando...</>
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

function isValidUrl(str) {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
