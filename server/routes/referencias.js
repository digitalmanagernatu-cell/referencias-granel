const express = require('express');
const router = express.Router();
const { getReferencias, addReferencia } = require('../services/sharepointService');

// ─── GET /api/referencias ──────────────────────────────────────────────────
// Devuelve todas las referencias desde la fila 56 del Excel en SharePoint.
router.get('/', async (req, res, next) => {
  try {
    const referencias = await getReferencias();
    res.json({ success: true, data: referencias });
  } catch (err) {
    console.error('[GET /api/referencias]', err.message);
    next(err);
  }
});

// ─── POST /api/referencias ─────────────────────────────────────────────────
// Añade una nueva referencia al Excel.
// Body esperado (JSON):
// {
//   nombreComercial, tipoProducto, categoria, nombreProducto,
//   nombreCliente?, peticionFechaLanzamiento?, proveedor?,
//   enlaces?
// }
router.post('/', async (req, res, next) => {
  try {
    const {
      nombreComercial,
      tipoProducto,
      categoria,
      nombreProducto,
      nombreCliente = '',
      peticionFechaLanzamiento = '',
      proveedor = '',
      enlaces = '',
    } = req.body;

    // Validate required fields
    if (!nombreComercial || !tipoProducto || !categoria || !nombreProducto) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos obligatorios: nombreComercial, tipoProducto, categoria, nombreProducto',
      });
    }

    // If tipo is Exclusiva, nombreCliente is required
    if (tipoProducto === 'Exclusiva' && !nombreCliente) {
      return res.status(400).json({
        success: false,
        error: 'Para tipo Exclusiva, el nombre del cliente es obligatorio',
      });
    }

    const today = new Date().toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const newReferencia = {
      numero: '',                      // A - Asignado por Natu
      nombreComercial,                 // B
      tipoProducto,                    // C
      categoria,                       // D
      nombreProducto,                  // E
      nRefAsignado: '',                // F - Asignado por Natu
      nombreCliente,                   // G
      peticionFechaLanzamiento,        // H
      fechaSolicitudComercial: today,  // I - Fecha actual
      proveedor,                       // J
      fechaSolicitudProveedor: '',     // K
      fechaLlegadaPropuesta: '',       // L
      estado: '',                      // M - Pendiente
      fechaValidacionNatu: '',         // N
      muestrasLaboratorio: '',         // O
      enlaces,                         // P
    };

    const result = await addReferencia(newReferencia);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    console.error('[POST /api/referencias]', err.message);
    if (err.code === 'DUPLICATE') {
      return res.status(409).json({ success: false, error: err.message });
    }
    next(err);
  }
});

module.exports = router;
