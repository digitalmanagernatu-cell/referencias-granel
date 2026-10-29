import { useState, useRef, useEffect } from 'react';
import './FilterBar.css';

const ESTADOS_FIJOS = ['APROBADO', 'DESCARTADO', 'EVALUANDO', 'PENDIENTE', 'RECHAZADO', 'TESTANDO', 'SIN_ESTADO'];

function displayLabel(v) {
  return v === 'SIN_ESTADO' ? 'Sin estado' : v;
}

function MultiSelect({ id, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (opt) => {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  };

  const summaryText =
    value.length === 0
      ? 'Todos'
      : value.length === 1
      ? displayLabel(value[0])
      : `${value.length} seleccionados`;

  return (
    <div className="multiselect-wrapper" ref={ref}>
      <button
        type="button"
        id={id}
        className={`filter-control multiselect-btn${value.length > 0 ? ' multiselect-active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="multiselect-summary">{summaryText}</span>
        <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true">
          <path d="M1 1L6 7L11 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="multiselect-dropdown" role="listbox" aria-multiselectable="true">
          {options.map((opt) => (
            <label key={opt} className={`multiselect-option${value.includes(opt) ? ' selected' : ''}`}>
              <input
                type="checkbox"
                checked={value.includes(opt)}
                onChange={() => toggle(opt)}
              />
              {displayLabel(opt)}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FilterBar({ filters, setFilters, opciones, onClear, activeCount }) {
  const update = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="filterbar">
      <div className="filterbar-grid">
        {/* Solicitante */}
        <div className="filter-group">
          <label className="filter-label" htmlFor="f-comercial">Solicitante</label>
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

        {/* Tipo Producto — multi-select */}
        <div className="filter-group">
          <label className="filter-label" htmlFor="f-tipo">Tipo de Producto</label>
          <MultiSelect
            id="f-tipo"
            options={opciones.tipos}
            value={filters.tipoProducto}
            onChange={(v) => update('tipoProducto', v)}
          />
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

        {/* Estado — multi-select */}
        <div className="filter-group">
          <label className="filter-label" htmlFor="f-estado">Estado</label>
          <MultiSelect
            id="f-estado"
            options={ESTADOS_FIJOS}
            value={filters.estado}
            onChange={(v) => update('estado', v)}
          />
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
