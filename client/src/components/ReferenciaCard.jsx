import './ReferenciaCard.css';

// ─── Badge helpers ──────────────────────────────────────────────────────────
export function getEstadoBadgeClass(estado) {
  const e = (estado || '').trim().toUpperCase();
  if (e === 'APROBADO')  return 'badge badge-aprobado';
  if (e === 'EVALUANDO') return 'badge badge-evaluando';
  if (e === 'TESTANDO')  return 'badge badge-testando';
  if (e === 'PENDIENTE') return 'badge badge-pendiente';
  return 'badge badge-sin-estado';
}

export function getEstadoLabel(estado) {
  const e = (estado || '').trim();
  return e || 'Sin estado';
}

export function getTipoBadgeClass(tipo) {
  const t = (tipo || '').trim().toLowerCase();
  if (t === 'nicho') return 'badge badge-nicho';
  if (t === 'selecto') return 'badge badge-selecto';
  if (t === 'body mist' || t === 'bodymist') return 'badge badge-bodymist';
  if (t === 'exclusivo' || t === 'exclusiva') return 'badge badge-exclusivo';
  if (t === 'extracto') return 'badge badge-extracto';
  return 'badge badge-normal'; // Normal / default
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function ReferenciaCard({ referencia, onVerDetalles }) {
  const {
    fechaSolicitudComercial,
    nombreProducto,
    tipoProducto,
    categoria,
    estado,
    enlaces,
    nombreComercial,
  } = referencia;

  const hasEnlace = Boolean(enlaces && enlaces.trim());

  return (
    <article className="card">
      <div className="card-header">
        <div className="card-meta">
          {fechaSolicitudComercial && (
            <span className="card-date">{fechaSolicitudComercial}</span>
          )}
          {nombreComercial && (
            <span className="card-comercial">{nombreComercial}</span>
          )}
        </div>
        <div className="card-badges">
          <span className={getTipoBadgeClass(tipoProducto)}>
            {tipoProducto || 'Normal'}
          </span>
        </div>
      </div>

      <div className="card-body">
        <h2 className="card-title" title={nombreProducto}>
          {nombreProducto || '—'}
        </h2>
        <p className="card-categoria">{categoria || '—'}</p>
      </div>

      <div className="card-footer">
        <span className={getEstadoBadgeClass(estado)}>
          {getEstadoLabel(estado)}
        </span>

        <div className="card-actions">
          <a
            href={hasEnlace ? enlaces.trim() : undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={`btn btn-outline btn-sm${!hasEnlace ? ' btn-disabled' : ''}`}
            tabIndex={hasEnlace ? 0 : -1}
            aria-disabled={!hasEnlace}
            title={hasEnlace ? 'Abrir en Fragrantica' : 'Sin enlace disponible'}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Fragrantica
          </a>
          <button className="btn btn-primary btn-sm" onClick={onVerDetalles}>
            Ver detalles
          </button>
        </div>
      </div>
    </article>
  );
}
