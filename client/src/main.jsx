import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          fontFamily: 'Inter, sans-serif',
          fontSize: '14px',
          borderRadius: '8px',
        },
        success: {
          iconTheme: { primary: '#2d6a4f', secondary: '#fff' },
        },
        error: {
          iconTheme: { primary: '#e63946', secondary: '#fff' },
        },
      }}
    />
  </React.StrictMode>
);
