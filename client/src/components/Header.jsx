import logoImg from '../assets/logo.png';
import './Header.css';

const IconRefresh = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

const AUTO_OPTIONS = [
  { value: 0,   label: 'Auto: off' },
  { value: 60,  label: '1 min' },
  { value: 300, label: '5 min' },
  { value: 600, label: '10 min' },
];

export default function Header({ onSolicitar, onRefresh, refreshing, autoRefreshInterval, onAutoRefreshChange }) {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-brand">
          <div className="header-logo" aria-hidden="true">
            <img src={logoImg} alt="" width="40" height="40" style={{ borderRadius: '8px', objectFit: 'contain' }} />
          </div>
          <div>
            <h1 className="header-title">Nuevas Referencias Granel</h1>
            <p className="header-subtitle">Natu · Gestión de solicitudes</p>
          </div>
        </div>

        <div className="header-controls">
          <button
            className={`btn-refresh${refreshing ? ' btn-refresh-spinning' : ''}`}
            onClick={onRefresh}
            disabled={refreshing}
            title="Actualizar datos"
            aria-label="Actualizar datos"
          >
            <IconRefresh />
          </button>
          <select
            className="select-autorefresh"
            value={autoRefreshInterval}
            onChange={(e) => onAutoRefreshChange(Number(e.target.value))}
            title="Frecuencia de actualización automática"
            aria-label="Actualización automática"
          >
            {AUTO_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <button className="btn-solicitar" onClick={onSolicitar}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Solicitar Referencia
        </button>
      </div>
    </header>
  );
}
