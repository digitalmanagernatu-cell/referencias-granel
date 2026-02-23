require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const referenciasRouter = require('./routes/referencias');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS solo necesario en desarrollo (en producción, mismo origen)
if (process.env.NODE_ENV !== 'production') {
  app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
}

app.use(express.json());

// Servir frontend compilado
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/referencias', referenciasRouter);

// Catch-all: servir React SPA para rutas no-API
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor',
  });
});

app.listen(PORT, () => {
  console.log(`[SERVER] Escuchando en http://localhost:${PORT}`);
});

module.exports = app;
