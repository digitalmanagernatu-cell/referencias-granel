import { useEffect } from 'react';
import { getEstadoBadgeClass, getEstadoLabel, getTipoBadgeClass } from './ReferenciaCard.jsx';
import './DetalleModal.css';

const FIELD_LABELS = {
  nombreComercial: 'Nombre del comercial',
  tipoProducto: 'Tipo de producto',
  categoria: 'Categoría',
  nombreProducto: 'Nombre del producto',
  nRefAsignado: 'Nº Ref. asignado',
  nombreCliente: 'Nombre del cliente',
  peticionFechaLanzamiento: 'Petición fecha de lanzamiento',
  fechaSolicitudComercial: 'Fecha solicitud comercial',
  proveedor: 'Proveedor',
  fechaSolicitudProveedor: 'Fecha de solicitud al proveedor',
  fechaLlegadaPropuesta: 'Fecha llegada propuesta',
  estado: 'Estado',
  fechaValidacionNatu: 'Fecha de validación Natu',
  muestrasLaboratorio: 'Muestras laboratorio',
  enlaces: 'Enlace (Fragrantica)',
};

export default function DetalleModal({ referencia, onClose }) {
  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const hasEnlace = Boolean(referencia.enlaces && referencia.enlaces.trim());

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-detalle" role="dialog" aria-modal="true" aria-labelledby="detalle-title">
        <div className="modal-header">
          <div className="modal-header-content">
            <h2 className="modal-title" id="detalle-title">
              {referencia.nombreProducto || 'Detalle de referencia'}
            </h2>
            <div className="modal-header-badges">
              <span className={getTipoBadgeClass(referencia.tipoProducto)}>
                {referencia.tipoProducto || 'Normal'}
              </span>
              <span className={getEstadoBadgeClass(referencia.estado)}>
                {getEstadoLabel(referencia.estado)}
              </span>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        <div className="modal-body">
          <div className="detalle-grid">
            {Object.entries(FIELD_LABELS).map(([key, label]) => {
              const value = referencia[key];
              if (!value) return null;

              if (key === 'enlaces') {
                return (
                  <div key={key} className="detalle-field detalle-field-full">
                    <span className="detalle-label">{label}</span>
                    <a
                      href={value.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="detalle-link"
                    >
                      {value.trim()}
                    </a>
                  </div>
                );
              }

              if (key === 'estado') {
                return (
                  <div key={key} className="detalle-field">
                    <span className="detalle-label">{label}</span>
                    <span className={`detalle-value ${getEstadoBadgeClass(value)}`} style={{ display: 'inline-flex' }}>
                      {getEstadoLabel(value)}
                    </span>
                  </div>
                );
              }

              return (
                <div key={key} className="detalle-field">
                  <span className="detalle-label">{label}</span>
                  <span className="detalle-value">{value}</span>
                </div>
              );
            })}
          </div>

          {/* All fields are empty check */}
          {Object.keys(FIELD_LABELS).every((k) => !referencia[k]) && (
            <p className="detalle-empty">No hay información adicional disponible.</p>
          )}
        </div>

        <div className="modal-footer">
          {hasEnlace && (
            <a
              href={referencia.enlaces.trim()}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Ver en Fragrantica
            </a>
          )}
          <button className="btn btn-primary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
