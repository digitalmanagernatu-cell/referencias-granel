import './FilterBar.css';

const ESTADOS_FIJOS = ['APROBADO', 'EVALUANDO', 'PENDIENTE', 'TESTANDO'];

export default function FilterBar({ filters, setFilters, opciones, onClear, activeCount }) {
  const update = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="filterbar">
      <div className="filterbar-grid">
        {/* Comercial */}
        <div className="filter-group">
          <label className="filter-label" htmlFor="f-comercial">Comercial</label>
          <select
            id="f-comercial"
            className="filter-control"
            value={filters.comercial}
            onChange={(e) => update('comercial', e.target.value)}
          >
            <option value="">Todos</option>
            {opciones.comerciales.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Tipo Producto */}
        <div className="filter-group">
          <label className="filter-label" htmlFor="f-tipo">Tipo de Producto</label>
          <select
            id="f-tipo"
            className="filter-control"
            value={filters.tipoProducto}
            onChange={(e) => update('tipoProducto', e.target.value)}
          >
            <option value="">Todos</option>
            {opciones.tipos.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Tipo Fragancia */}
        <div className="filter-group">
          <label className="filter-label" htmlFor="f-tipo-fragancia">Tipo Fragancia</label>
          <select
            id="f-tipo-fragancia"
            className="filter-control"
            value={filters.tipoFragancia}
            onChange={(e) => update('tipoFragancia', e.target.value)}
          >
            <option value="">Todos</option>
            {opciones.tiposFragancia.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Categoría */}
        <div className="filter-group">
          <label className="filter-label" htmlFor="f-categoria">Categoría</label>
          <select
            id="f-categoria"
            className="filter-control"
            value={filters.categoria}
            onChange={(e) => update('categoria', e.target.value)}
          >
            <option value="">Todas</option>
            {opciones.categorias.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Estado */}
        <div className="filter-group">
          <label className="filter-label" htmlFor="f-estado">Estado</label>
          <select
            id="f-estado"
            className="filter-control"
            value={filters.estado}
            onChange={(e) => update('estado', e.target.value)}
          >
            <option value="">Todos</option>
            {ESTADOS_FIJOS.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
            <option value="SIN_ESTADO">Sin estado</option>
          </select>
        </div>

        {/* Fecha desde */}
        <div className="filter-group">
          <label className="filter-label" htmlFor="f-desde">Fecha solicitud desde</label>
          <input
            id="f-desde"
            type="date"
            className="filter-control"
            value={filters.fechaDesde}
            onChange={(e) => update('fechaDesde', e.target.value)}
          />
        </div>

        {/* Fecha hasta */}
        <div className="filter-group">
          <label className="filter-label" htmlFor="f-hasta">Hasta</label>
          <input
            id="f-hasta"
            type="date"
            className="filter-control"
            value={filters.fechaHasta}
            onChange={(e) => update('fechaHasta', e.target.value)}
          />
        </div>
      </div>

      {activeCount > 0 && (
        <div className="filterbar-actions">
          <button className="btn-clear" onClick={onClear}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Limpiar filtros
            <span className="filter-badge">{activeCount}</span>
          </button>
        </div>
      )}
    </div>
  );
}
