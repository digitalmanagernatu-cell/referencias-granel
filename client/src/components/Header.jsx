import './Header.css';

export default function Header({ onSolicitar }) {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-brand">
          <div className="header-logo" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="8" fill="#1b4332" />
              <path d="M8 22C8 22 10 14 16 14C22 14 24 22 24 22" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
              <circle cx="16" cy="11" r="3" fill="#52b788" />
              <path d="M13 22C13 22 14 18 16 18C18 18 19 22 19 22" stroke="#52b788" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
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
