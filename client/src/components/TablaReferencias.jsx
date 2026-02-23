import { getEstadoBadgeClass, getEstadoLabel, getTipoBadgeClass } from './ReferenciaCard.jsx';
import './TablaReferencias.css';

const IconLink = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

export default function TablaReferencias({ referencias, onVerDetalles }) {
  if (referencias.length === 0) return null;

  return (
    <div className="tabla-wrapper">
      <table className="tabla">
        <thead>
          <tr>
            <th>Fecha solicitud</th>
            <th>Nombre producto</th>
            <th>Tipo producto</th>
            <th>Categoría</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {referencias.map((ref, idx) => {
            const hasEnlace = Boolean(ref.enlaces && ref.enlaces.trim());
            return (
              <tr key={ref._sheetRow ?? idx}>
                <td className="td-fecha">
                  {ref.fechaSolicitudComercial || '—'}
                </td>
                <td className="td-nombre" title={ref.nombreProducto}>
                  {ref.nombreProducto || '—'}
                </td>
                <td>
                  <span className={getTipoBadgeClass(ref.tipoProducto)}>
                    {ref.tipoProducto || 'Normal'}
                  </span>
                </td>
                <td className="td-categoria">
                  {ref.categoria || '—'}
                </td>
                <td>
                  <span className={getEstadoBadgeClass(ref.estado)}>
                    {getEstadoLabel(ref.estado)}
                  </span>
                </td>
                <td className="td-actions">
                  <a
                    href={hasEnlace ? ref.enlaces.trim() : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`btn btn-outline btn-sm${!hasEnlace ? ' btn-disabled' : ''}`}
                    tabIndex={hasEnlace ? 0 : -1}
                    aria-disabled={!hasEnlace}
                    title={hasEnlace ? 'Ver en Fragrantica' : 'Sin enlace disponible'}
                  >
                    <IconLink />
                    Fragrantica
                  </a>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => onVerDetalles(ref)}
                  >
                    Ver detalles
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
