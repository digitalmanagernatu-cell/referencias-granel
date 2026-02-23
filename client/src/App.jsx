import { useState, useMemo } from 'react';
import Header from './components/Header.jsx';
import FilterBar from './components/FilterBar.jsx';
import ReferenciaCard from './components/ReferenciaCard.jsx';
import DetalleModal from './components/DetalleModal.jsx';
import SolicitudModal from './components/SolicitudModal.jsx';
import useReferencias from './hooks/useReferencias.js';
import './App.css';

export default function App() {
  const { referencias, loading, error, refetch } = useReferencias();

  // Modal state
  const [detalleReferencia, setDetalleReferencia] = useState(null);
  const [solicitudOpen, setSolicitudOpen] = useState(false);

  // Filters
  const [filters, setFilters] = useState({
    comercial: '',
    tipoProducto: '',
    categoria: '',
    estado: '',
    fechaDesde: '',
    fechaHasta: '',
  });

  // Derive unique filter options from data
  const opciones = useMemo(() => {
    const comerciales = [...new Set(referencias.map((r) => r.nombreComercial).filter(Boolean))].sort();
    const tipos = [...new Set(referencias.map((r) => r.tipoProducto).filter(Boolean))].sort();
    const categorias = [...new Set(referencias.map((r) => r.categoria).filter(Boolean))].sort();
    const estados = [...new Set(referencias.map((r) => r.estado).filter(Boolean))].sort();
    return { comerciales, tipos, categorias, estados };
  }, [referencias]);

  // Filtered data
  const filtered = useMemo(() => {
    return referencias.filter((r) => {
      if (filters.comercial && r.nombreComercial !== filters.comercial) return false;
      if (filters.tipoProducto && r.tipoProducto !== filters.tipoProducto) return false;
      if (filters.categoria && r.categoria !== filters.categoria) return false;
      if (filters.estado) {
        const estado = r.estado?.trim() || '';
        if (filters.estado === 'SIN_ESTADO') {
          if (estado !== '') return false;
        } else {
          if (estado.toUpperCase() !== filters.estado.toUpperCase()) return false;
        }
      }
      if (filters.fechaDesde || filters.fechaHasta) {
        const fecha = parseDate(r.fechaSolicitudComercial);
        if (filters.fechaDesde && fecha && fecha < new Date(filters.fechaDesde)) return false;
        if (filters.fechaHasta && fecha && fecha > new Date(filters.fechaHasta + 'T23:59:59')) return false;
        if (!fecha && (filters.fechaDesde || filters.fechaHasta)) return false;
      }
      return true;
    });
  }, [referencias, filters]);

  const clearFilters = () =>
    setFilters({ comercial: '', tipoProducto: '', categoria: '', estado: '', fechaDesde: '', fechaHasta: '' });

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="app">
      <Header onSolicitar={() => setSolicitudOpen(true)} />

      <main className="main">
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          opciones={opciones}
          onClear={clearFilters}
          activeCount={activeFilterCount}
        />

        <div className="results-info">
          {!loading && !error && (
            <span className="results-count">
              {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
              {activeFilterCount > 0 && ` (de ${referencias.length} total)`}
            </span>
          )}
        </div>

        {loading && <LoadingState />}
        {error && <ErrorState message={error} onRetry={refetch} />}
        {!loading && !error && filtered.length === 0 && (
          <EmptyState hasFilters={activeFilterCount > 0} onClear={clearFilters} />
        )}
        {!loading && !error && filtered.length > 0 && (
          <div className="grid">
            {filtered.map((ref, idx) => (
              <ReferenciaCard
                key={ref._sheetRow ?? idx}
                referencia={ref}
                onVerDetalles={() => setDetalleReferencia(ref)}
              />
            ))}
          </div>
        )}
      </main>

      {detalleReferencia && (
        <DetalleModal
          referencia={detalleReferencia}
          onClose={() => setDetalleReferencia(null)}
        />
      )}

      {solicitudOpen && (
        <SolicitudModal
          onClose={() => setSolicitudOpen(false)}
          onSuccess={() => {
            setSolicitudOpen(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function parseDate(str) {
  if (!str) return null;
  // Accepts DD/MM/YYYY or YYYY-MM-DD
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [d, m, y] = str.split('/');
    return new Date(`${y}-${m}-${d}`);
  }
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

// ─── State components ───────────────────────────────────────────────────────
function LoadingState() {
  return (
    <div className="state-container">
      <div className="spinner" aria-label="Cargando..." />
      <p className="state-text">Cargando referencias...</p>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="state-container state-error">
      <div className="state-icon">⚠️</div>
      <p className="state-title">Error al cargar los datos</p>
      <p className="state-text">{message}</p>
      <button className="btn btn-primary" onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}

function EmptyState({ hasFilters, onClear }) {
  return (
    <div className="state-container">
      <div className="state-icon">🔍</div>
      <p className="state-title">Sin resultados</p>
      <p className="state-text">
        {hasFilters
          ? 'No hay referencias que coincidan con los filtros aplicados.'
          : 'Todavía no hay referencias registradas.'}
      </p>
      {hasFilters && (
        <button className="btn btn-outline" onClick={onClear}>
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
