import logoImg from '../assets/logo.png';
import './Header.css';

export default function Header({ onSolicitar }) {
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
