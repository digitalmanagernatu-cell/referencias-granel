import { useState, useMemo } from 'react';
import Header from './components/Header.jsx';
import FilterBar from './components/FilterBar.jsx';
import Dashboard from './components/Dashboard.jsx';
import TablaReferencias from './components/TablaReferencias.jsx';
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
    tipoFragancia: '',
    categoria: '',
    estado: '',
    fechaDesde: '',
    fechaHasta: '',
  });

  // Derive unique filter options from data — deduplicated case-insensitively
  // so "ESPAÑA" and "España" don't appear as two separate entries.
  const opciones = useMemo(() => {
    // Normalise to UPPERCASE and deduplicate, then sort alphabetically
    function normalizeOptions(values, excludeLower = []) {
      const seen = new Set();
      const result = [];
      values.filter(Boolean).forEach((v) => {
        const norm = v.trim().toUpperCase();
        if (norm && !seen.has(norm) && !excludeLower.includes(norm.toLowerCase())) {
          seen.add(norm);
          result.push(norm);
        }
      });
      return result.sort((a, b) => a.localeCompare(b, 'es'));
    }

    return {
      comerciales: normalizeOptions(referencias.map((r) => r.nombreComercial)),
      tipos: normalizeOptions(
        referencias.map((r) => r.tipoProducto),
        ['vvcc']
      ),
      tiposFragancia: normalizeOptions(referencias.map((r) => r.tipoFragancia)),
      categorias: normalizeOptions(referencias.map((r) => r.categoria)),
    };
  }, [referencias]);

  // Filtered data for the table — all text comparisons are case-insensitive
  const filtered = useMemo(() => {
    return referencias.filter((r) => {
      if (filters.comercial &&
        (r.nombreComercial || '').trim().toUpperCase() !== filters.comercial) return false;
      if (filters.tipoProducto &&
        (r.tipoProducto || '').trim().toUpperCase() !== filters.tipoProducto) return false;
      if (filters.tipoFragancia &&
        (r.tipoFragancia || '').trim().toUpperCase() !== filters.tipoFragancia) return false;
      if (filters.categoria &&
        (r.categoria || '').trim().toUpperCase() !== filters.categoria) return false;
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
    setFilters({ comercial: '', tipoProducto: '', tipoFragancia: '', categoria: '', estado: '', fechaDesde: '', fechaHasta: '' });

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="app">
      <Header onSolicitar={() => setSolicitudOpen(true)} />

      <main className="main">
        {/* Dashboard: KPI cards + pie charts — always shows totals over all data */}
        {!loading && !error && referencias.length > 0 && (
          <Dashboard referencias={referencias} />
        )}

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
          <TablaReferencias
            referencias={filtered}
            onVerDetalles={setDetalleReferencia}
          />
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
