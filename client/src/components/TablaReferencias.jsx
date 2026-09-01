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

const IconPlus = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export default function TablaReferencias({ referencias, onVerDetalles, onFilterClick, activeFilters = {}, onAddEnlace }) {
  if (referencias.length === 0) return null;

  const handleTipo = (tipoProducto) => {
    if (!onFilterClick) return;
    const val = (tipoProducto || '').trim().toUpperCase() || 'NORMAL';
    onFilterClick('tipoProducto', val);
  };

  const handleCategoria = (categoria) => {
    if (!onFilterClick || !categoria) return;
    onFilterClick('categoria', categoria.trim().toUpperCase());
  };

  const handleEstado = (estado) => {
    if (!onFilterClick) return;
    const val = (estado?.trim() || '') === '' ? 'SIN_ESTADO' : estado.trim().toUpperCase();
    onFilterClick('estado', val);
  };

  return (
    <div className="tabla-wrapper">
      <table className="tabla">
        <thead>
          <tr>
            <th>Fecha solicitud</th>
            <th>Nº Ref.</th>
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
            const tipoVal = (ref.tipoProducto || '').trim().toUpperCase() || 'NORMAL';
            const catVal  = (ref.categoria || '').trim().toUpperCase();
            const estadoVal = (ref.estado?.trim() || '') === '' ? 'SIN_ESTADO' : (ref.estado || '').trim().toUpperCase();

            const tipoActive    = activeFilters.tipoProducto === tipoVal;
            const catActive     = catVal && activeFilters.categoria === catVal;
            const estadoActive  = activeFilters.estado?.toUpperCase() === estadoVal;

            return (
              <tr key={ref._sheetRow ?? idx}>
                <td className="td-fecha">
                  {ref.fechaSolicitudComercial || '—'}
                </td>
                <td className="td-nref">
                  {ref.nRefAsignado || '—'}
                </td>
                <td className="td-nombre" title={ref.nombreProducto}>
                  {ref.nombreProducto || '—'}
                </td>
                <td>
                  <span
                    className={`${getTipoBadgeClass(ref.tipoProducto)} badge-filter${tipoActive ? ' badge-filter-active' : ''}`}
                    onClick={() => handleTipo(ref.tipoProducto)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && handleTipo(ref.tipoProducto)}
                    title={tipoActive ? 'Quitar filtro' : 'Filtrar por este tipo'}
                  >
                    {ref.tipoProducto || 'Normal'}
                  </span>
                </td>
                <td className="td-categoria">
                  {ref.categoria ? (
                    <span
                      className={`cat-filter${catActive ? ' cat-filter-active' : ''}`}
                      onClick={() => handleCategoria(ref.categoria)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && handleCategoria(ref.categoria)}
                      title={catActive ? 'Quitar filtro' : 'Filtrar por esta categoría'}
                    >
                      {ref.categoria}
                    </span>
                  ) : '—'}
                </td>
                <td>
                  <span
                    className={`${getEstadoBadgeClass(ref.estado)} badge-filter${estadoActive ? ' badge-filter-active' : ''}`}
                    onClick={() => handleEstado(ref.estado)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && handleEstado(ref.estado)}
                    title={estadoActive ? 'Quitar filtro' : 'Filtrar por este estado'}
                  >
                    {getEstadoLabel(ref.estado)}
                  </span>
                </td>
                <td className="td-actions">
                  {hasEnlace ? (
                    <a
                      href={ref.enlaces.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline btn-sm"
                      title="Ver en Fragrantica"
                    >
                      <IconLink />
                      Fragrantica
                    </a>
                  ) : (
                    <button
                      className="btn btn-outline btn-sm btn-add-enlace"
                      onClick={() => onAddEnlace && onAddEnlace(ref)}
                      title="Añadir enlace de Fragrantica"
                    >
                      <IconPlus />
                      Fragrantica
                    </button>
                  )}
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
