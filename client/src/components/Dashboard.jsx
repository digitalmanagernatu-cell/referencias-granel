import './Dashboard.css';

// Color palette for dynamic categories / tipos
const PALETTE = [
  '#1b4332', '#40916c', '#74c69d', '#7c3aed', '#db2777',
  '#ea580c', '#2563eb', '#b45309', '#dc2626', '#0891b2',
  '#65a30d', '#d97706', '#9333ea', '#0f766e', '#be123c',
];

function getColor(index) {
  return PALETTE[index % PALETTE.length];
}

// ─── SVG Pie chart ──────────────────────────────────────────────────────────
function PieChart({ slices, size = 120 }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;
  const total = slices.reduce((s, d) => s + d.value, 0);

  if (total === 0) return <div className="chart-empty">Sin datos</div>;

  let angle = -Math.PI / 2;
  const computed = slices.map((d) => {
    const start = angle;
    const sweep = (d.value / total) * 2 * Math.PI;
    angle += sweep;
    return { ...d, start, sweep, end: angle };
  });

  function slicePath({ start, sweep, end }) {
    // Full circle when single slice
    if (slices.length === 1) {
      return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.001} ${cy - r} Z`;
    }
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const large = sweep > Math.PI ? 1 : 0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {computed.map((s, i) => (
        <path key={i} d={slicePath(s)} fill={s.color} stroke="#fff" strokeWidth="2" />
      ))}
    </svg>
  );
}

// ─── Chart card with legend ─────────────────────────────────────────────────
function ChartCard({ title, slices }) {
  const total = slices.reduce((s, d) => s + d.value, 0);
  return (
    <div className="chart-card">
      <h3 className="chart-title">{title}</h3>
      <div className="chart-content">
        <PieChart slices={slices} size={120} />
        <ul className="chart-legend">
          {slices.map((s, i) => (
            <li key={i} className="legend-item">
              <span className="legend-dot" style={{ background: s.color }} />
              <span className="legend-label" title={s.label}>{s.label}</span>
              <span className="legend-value">{s.value}</span>
              <span className="legend-pct">
                {total ? Math.round((s.value / total) * 100) : 0}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────
export default function Dashboard({ referencias }) {
  const total = referencias.length;

  // KPI counts by estado
  const aprobadas = referencias.filter(
    (r) => (r.estado || '').trim().toUpperCase() === 'APROBADO'
  ).length;
  const evaluando = referencias.filter((r) => {
    const e = (r.estado || '').trim().toUpperCase();
    return e === 'EVALUACIÓN' || e === 'EVALUACION';
  }).length;
  const testando = referencias.filter(
    (r) => (r.estado || '').trim().toUpperCase() === 'TESTANDO'
  ).length;
  const sinEstado = referencias.filter((r) => !(r.estado || '').trim()).length;

  // Slices for estado chart
  const estadoSlices = [
    { label: 'Aprobado',   value: aprobadas, color: '#16a34a' },
    { label: 'Evaluando',  value: evaluando, color: '#ea580c' },
    { label: 'Testando',   value: testando,  color: '#2563eb' },
    { label: 'Sin estado', value: sinEstado, color: '#94a3b8' },
  ].filter((s) => s.value > 0);

  // Slices for categoría
  const catMap = {};
  referencias.forEach((r) => {
    const c = (r.categoria || '').trim() || 'Sin categoría';
    catMap[c] = (catMap[c] || 0) + 1;
  });
  const catSlices = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: getColor(i) }));

  // Slices for tipo de producto
  const tipoMap = {};
  referencias.forEach((r) => {
    const t = (r.tipoProducto || '').trim() || 'Sin tipo';
    tipoMap[t] = (tipoMap[t] || 0) + 1;
  });
  const tipoSlices = Object.entries(tipoMap)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: getColor(i + 5) }));

  return (
    <section className="dashboard">
      {/* KPI cards */}
      <div className="kpi-row">
        <div className="kpi-card">
          <span className="kpi-label">Total solicitudes</span>
          <span className="kpi-value">{total}</span>
        </div>
        <div className="kpi-card kpi-aprobado">
          <span className="kpi-label">Aprobadas</span>
          <span className="kpi-value">{aprobadas}</span>
        </div>
        <div className="kpi-card kpi-evaluando">
          <span className="kpi-label">Evaluando</span>
          <span className="kpi-value">{evaluando}</span>
        </div>
        <div className="kpi-card kpi-testando">
          <span className="kpi-label">Testando</span>
          <span className="kpi-value">{testando}</span>
        </div>
      </div>

      {/* Pie charts */}
      {total > 0 && (
        <div className="charts-row">
          <ChartCard title="Por estado" slices={estadoSlices} />
          <ChartCard title="Por categoría" slices={catSlices} />
          <ChartCard title="Por tipo de producto" slices={tipoSlices} />
        </div>
      )}
    </section>
  );
}
