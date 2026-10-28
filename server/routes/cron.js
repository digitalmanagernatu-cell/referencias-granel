const express = require('express');
const router = express.Router();
const { getReferencias } = require('../services/sharepointService');
const { makeClient, initTable, getSnapshots, upsertSnapshots } = require('../services/snapshotService');
const {
  sendNuevaReferencia, sendCambioEstado,
  sendEnlaceActualizado, sendNRefAsignado, sendActualizacionGeneral,
} = require('../services/emailService');

function checkSecret(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${secret}`;
}

const GENERAL_FIELDS = [
  'nombreProducto', 'nombreComercial', 'tipoProducto', 'categoria',
  'tipoFragancia', 'proveedor', 'nombreCliente', 'peticionFechaLanzamiento',
  'muestrasLaboratorio', 'notasLaboratorio',
];

router.get('/check-changes', async (req, res) => {
  if (!checkSecret(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: 'DATABASE_URL no configurada en variables de entorno' });
  }

  const log = [];
  const client = makeClient();
  try {
    await client.connect();
    await initTable(client);
    const [current, snapshots] = await Promise.all([
      getReferencias(),
      getSnapshots(client),
    ]);

    // Primera ejecución: solo guardar snapshot sin emails
    if (snapshots.size === 0) {
      await upsertSnapshots(client, current);
      return res.json({ ok: true, checked: current.length, changes: ['Primera ejecución: snapshot inicial guardado'] });
    }

    const emailTasks = [];

    for (const ref of current) {
      const prev = snapshots.get(ref._sheetRow);

      if (!prev) {
        log.push(`NUEVA: ${ref.nombreProducto} (fila ${ref._sheetRow})`);
        emailTasks.push(sendNuevaReferencia(ref));
        continue;
      }

      // Si la fecha de solicitud cambió, la fila fue reemplazada por una referencia diferente
      const fechaActual   = (ref.fechaSolicitudComercial  || '').trim();
      const fechaAnterior = (prev.fechaSolicitudComercial || '').trim();
      if (fechaActual && fechaAnterior && fechaActual !== fechaAnterior) {
        log.push(`NUEVA (fila reutilizada): ${ref.nombreProducto} (fila ${ref._sheetRow})`);
        emailTasks.push(sendNuevaReferencia(ref));
        continue;
      }

      const estadoNuevo = (ref.estado || '').trim().toUpperCase();
      const estadoAnterior = (prev.estado || '').trim().toUpperCase();
      if (estadoNuevo !== estadoAnterior) {
        log.push(`ESTADO: ${ref.nombreProducto} ${estadoAnterior} → ${estadoNuevo}`);
        emailTasks.push(sendCambioEstado(ref, estadoAnterior, estadoNuevo));
      }

      const enlaceNuevo = (ref.enlaces || '').trim();
      const enlaceAnterior = (prev.enlaces || '').trim();
      if (enlaceNuevo && enlaceNuevo !== enlaceAnterior) {
        log.push(`ENLACE: ${ref.nombreProducto}`);
        emailTasks.push(sendEnlaceActualizado(ref));
      }

      const nRefNuevo = (ref.nRefAsignado || '').trim();
      const nRefAnterior = (prev.nRefAsignado || '').trim();
      if (nRefNuevo && nRefNuevo !== nRefAnterior) {
        log.push(`NREF: ${ref.nombreProducto} → ${nRefNuevo}`);
        emailTasks.push(sendNRefAsignado(ref, nRefNuevo));
      }

      const otrosCambios = GENERAL_FIELDS
        .filter(f => (ref[f] || '') !== (prev[f] || ''))
        .map(f => ({ campo: f, antes: prev[f] || '—', despues: ref[f] || '—' }));

      if (otrosCambios.length > 0) {
        log.push(`CAMBIOS: ${ref.nombreProducto} [${otrosCambios.map(c => c.campo).join(', ')}]`);
        emailTasks.push(sendActualizacionGeneral(ref, otrosCambios));
      }
    }

    const [emailResults] = await Promise.allSettled([
      Promise.allSettled(emailTasks),
      upsertSnapshots(client, current),
    ]);

    const emailErrors = (emailResults.value || [])
      .filter(r => r.status === 'rejected')
      .map(r => r.reason?.message);

    res.json({
      ok: true,
      checked: current.length,
      changes: log,
      emailErrors: emailErrors.length ? emailErrors : undefined,
    });
  } catch (err) {
    console.error('[cron/check-changes]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    await client.end().catch(() => {});
  }
});

// GET /api/cron/auth-test — muestra qué Authorization recibe el servidor vs CRON_SECRET
router.get('/auth-test', (req, res) => {
  const received = req.headers.authorization || '(vacío)';
  const secret = process.env.CRON_SECRET || '(no configurado)';
  res.json({
    received,
    expected: `Bearer ${secret}`,
    match: received === `Bearer ${secret}`,
  });
});

// GET /api/cron/db-test — diagnóstico de conexión a Neon (sin autenticación)
router.get('/db-test', async (req, res) => {
  if (!process.env.DATABASE_URL) {
    return res.json({ ok: false, error: 'DATABASE_URL no configurada' });
  }
  const rawUrl = process.env.DATABASE_URL;
  const cleanUrl = rawUrl
    .replace(/([?&])channel_binding=[^&]*/g, '$1')
    .replace(/[?&]$/, '');
  const { Client } = require('pg');
  const client = new Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const { rows } = await client.query('SELECT NOW() AS now');
    res.json({ ok: true, time: rows[0].now, urlHasChannelBinding: rawUrl.includes('channel_binding') });
  } catch (err) {
    res.json({ ok: false, error: err.message, code: err.code });
  } finally {
    await client.end().catch(() => {});
  }
});

module.exports = router;
