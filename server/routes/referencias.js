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
//   nombreComercial, tipoProducto, tipoFragancia, categoria, nombreProducto,
//   nombreCliente?, peticionFechaLanzamiento?, proveedor?, enlaces?
// }
router.post('/', async (req, res, next) => {
  try {
    const {
      nombreComercial,
      tipoProducto,
      tipoFragancia,
      categoria,
      nombreProducto,
      nombreCliente = '',
      peticionFechaLanzamiento = '',
      proveedor = '',
      enlaces = '',
    } = req.body;

    // Validate required fields
    if (!nombreComercial || !tipoProducto || !tipoFragancia || !categoria || !nombreProducto) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos obligatorios: nombreComercial, tipoProducto, tipoFragancia, categoria, nombreProducto',
      });
    }

    // If tipo is Exclusiva, nombreCliente is required (form sends uppercase EXCLUSIVA)
    if ((tipoProducto || '').toUpperCase() === 'EXCLUSIVA' && !nombreCliente) {
      return res.status(400).json({
        success: false,
        error: 'Para tipo Exclusiva, el nombre del cliente es obligatorio',
      });
    }

    const now = new Date();
    const today = [
      String(now.getMonth() + 1).padStart(2, '0'),  // MM  (Excel SharePoint usa locale US)
      String(now.getDate()).padStart(2, '0'),          // DD
      now.getFullYear(),                               // YYYY
    ].join('/');

    const newReferencia = {
      numero: '',                      // A - Asignado por Natu
      nombreComercial,                 // B
      tipoProducto,                    // C
      tipoFragancia,                   // D - FEMENINO / MASCULINO / UNISEX
      categoria,                       // E
      nombreProducto,                  // F
      nRefAsignado: '',                // G - Asignado por Natu
      nombreCliente,                   // H
      peticionFechaLanzamiento,        // I
      fechaSolicitudComercial: today,  // J - Fecha actual
      proveedor,                       // K
      fechaSolicitudProveedor: '',     // L
      fechaLlegadaPropuesta: '',       // M
      estado: '',                      // N - se sobreescribirá con PENDIENTE en addReferencia
      fechaValidacionNatu: '',         // O
      muestrasLaboratorio: '',         // P
      enlaces,                         // Q
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
