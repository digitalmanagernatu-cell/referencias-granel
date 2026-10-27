const express = require('express');
const router = express.Router();
const { getReferencias, addReferencia, updateEnlace, updateNRef, updateEstado } = require('../services/sharepointService');
const { sendNuevaReferencia, sendEnlaceActualizado, sendNRefAsignado, sendCambioEstado } = require('../services/emailService');

const ESTADOS_VALIDOS = ['APROBADO', 'DESCARTADO', 'EVALUANDO', 'PENDIENTE', 'RECHAZADO', 'TESTANDO'];

// ─── GET /api/referencias ──────────────────────────────────────────────────
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
router.post('/', async (req, res, next) => {
  try {
    const {
      nombreComercial, tipoProducto, tipoFragancia, categoria, nombreProducto,
      nombreCliente = '', peticionFechaLanzamiento = '', proveedor = '', enlaces = '',
    } = req.body;

    if (!nombreComercial || !tipoProducto || !tipoFragancia || !categoria || !nombreProducto) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos obligatorios: nombreComercial, tipoProducto, tipoFragancia, categoria, nombreProducto',
      });
    }
    if ((tipoProducto || '').toUpperCase() === 'EXCLUSIVA' && !nombreCliente) {
      return res.status(400).json({ success: false, error: 'Para tipo Exclusiva, el nombre del cliente es obligatorio' });
    }

    const now = new Date();
    const today = [
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      now.getFullYear(),
    ].join('/');

    const newReferencia = {
      numero: '', nombreComercial, tipoProducto, tipoFragancia, categoria, nombreProducto,
      nRefAsignado: '', nombreCliente, peticionFechaLanzamiento,
      fechaSolicitudComercial: today, proveedor,
      fechaSolicitudProveedor: '', fechaLlegadaPropuesta: '', estado: '',
      fechaValidacionNatu: '', muestrasLaboratorio: '', enlaces,
    };

    const result = await addReferencia(newReferencia);
    res.status(201).json({ success: true, data: result });

    sendNuevaReferencia(result).catch((e) =>
      console.error('[email] nueva referencia:', e.message)
    );
  } catch (err) {
    console.error('[POST /api/referencias]', err.message);
    if (err.code === 'DUPLICATE') {
      return res.status(409).json({ success: false, error: err.message });
    }
    next(err);
  }
});

// ─── PATCH /api/referencias/:sheetRow/enlace ───────────────────────────────
router.patch('/:sheetRow/enlace', async (req, res, next) => {
  try {
    const sheetRow = parseInt(req.params.sheetRow, 10);
    if (isNaN(sheetRow) || sheetRow < 1) {
      return res.status(400).json({ success: false, error: 'sheetRow inválido' });
    }
    const { enlace, referencia } = req.body;
    if (!enlace || !enlace.trim()) {
      return res.status(400).json({ success: false, error: 'El campo enlace es obligatorio' });
    }
    await updateEnlace(sheetRow, enlace.trim());
    res.json({ success: true });

    if (referencia) {
      sendEnlaceActualizado({ ...referencia, enlaces: enlace.trim() }).catch((e) =>
        console.error('[email] enlace actualizado:', e.message)
      );
    }
  } catch (err) {
    console.error('[PATCH /api/referencias/:sheetRow/enlace]', err.message);
    next(err);
  }
});

// ─── PATCH /api/referencias/:sheetRow/nref ─────────────────────────────────
router.patch('/:sheetRow/nref', async (req, res, next) => {
  try {
    const sheetRow = parseInt(req.params.sheetRow, 10);
    if (isNaN(sheetRow) || sheetRow < 1) {
      return res.status(400).json({ success: false, error: 'sheetRow inválido' });
    }
    const { nRef, referencia } = req.body;
    if (!nRef || !nRef.trim()) {
      return res.status(400).json({ success: false, error: 'El campo nRef es obligatorio' });
    }
    await updateNRef(sheetRow, nRef.trim());
    res.json({ success: true });

    if (referencia) {
      sendNRefAsignado(referencia, nRef.trim()).catch((e) =>
        console.error('[email] nRef asignado:', e.message)
      );
    }
  } catch (err) {
    console.error('[PATCH /api/referencias/:sheetRow/nref]', err.message);
    next(err);
  }
});

// ─── PATCH /api/referencias/:sheetRow/estado ───────────────────────────────
router.patch('/:sheetRow/estado', async (req, res, next) => {
  try {
    const sheetRow = parseInt(req.params.sheetRow, 10);
    if (isNaN(sheetRow) || sheetRow < 1) {
      return res.status(400).json({ success: false, error: 'sheetRow inválido' });
    }
    const { estado, estadoAnterior, referencia } = req.body;
    const estadoNorm = (estado || '').trim().toUpperCase();
    if (!estadoNorm || !ESTADOS_VALIDOS.includes(estadoNorm)) {
      return res.status(400).json({
        success: false,
        error: `Estado inválido. Valores permitidos: ${ESTADOS_VALIDOS.join(', ')}`,
      });
    }
    await updateEstado(sheetRow, estadoNorm);
    res.json({ success: true });

    if (referencia) {
      sendCambioEstado(referencia, estadoAnterior || '', estadoNorm).catch((e) =>
        console.error('[email] cambio estado:', e.message)
      );
    }
  } catch (err) {
    console.error('[PATCH /api/referencias/:sheetRow/estado]', err.message);
    next(err);
  }
});

module.exports = router;
