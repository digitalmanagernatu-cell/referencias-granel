const express = require('express');
const router = express.Router();
const { getReferencias } = require('../services/sharepointService');
const { initTable, getSnapshots, upsertSnapshots } = require('../services/snapshotService');
const {
  sendNuevaReferencia, sendCambioEstado,
  sendEnlaceActualizado, sendNRefAsignado, sendActualizacionGeneral,
} = require('../services/emailService');

// Protege el endpoint con un secret para que no sea público
function checkSecret(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // si no hay secret configurado, permite (entorno dev)
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${secret}`;
}

// Los campos que generan un email específico si cambian
const WATCHED_FIELDS = {
  estado:       'estado',
  enlaces:      'enlace',
  nRefAsignado: 'nref',
};

// Campos que si cambian generan un email genérico de actualización
const GENERAL_FIELDS = [
  'nombreProducto', 'nombreComercial', 'tipoProducto', 'categoria',
  'tipoFragancia', 'proveedor', 'nombreCliente', 'peticionFechaLanzamiento',
  'muestrasLaboratorio', 'notasLaboratorio',
];

// GET /api/cron/check-changes
// Llamado por Vercel Cron (o un servicio externo tipo cron-job.org)
router.get('/check-changes', async (req, res) => {
  if (!checkSecret(req, res)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: 'DATABASE_URL no configurada en variables de entorno' });
  }

  const log = [];
  try {
    await initTable();
    const [current, snapshots] = await Promise.all([
      getReferencias(),
      getSnapshots(),
    ]);

    const emailTasks = [];

    // Si el snapshot estaba vacío es la primera ejecución — solo guardar, sin emails
    const isFirstRun = snapshots.size === 0;
    if (isFirstRun) {
      await upsertSnapshots(current);
      return res.json({ ok: true, checked: current.length, changes: ['Primera ejecución: snapshot inicial guardado'], emailErrors: undefined });
    }

    for (const ref of current) {
      const prev = snapshots.get(ref._sheetRow);

      if (!prev) {
        // Referencia nueva (añadida después del primer snapshot)
        log.push(`NUEVA: ${ref.nombreProducto} (fila ${ref._sheetRow})`);
        emailTasks.push(sendNuevaReferencia(ref));
        continue;
      }

      // ── Cambios en campos vigilados ──────────────────────────────────────
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

      // ── Otros cambios → email genérico ──────────────────────────────────
      const otrosCambios = GENERAL_FIELDS
        .filter(f => (ref[f] || '') !== (prev[f] || ''))
        .map(f => ({ campo: f, antes: prev[f] || '—', despues: ref[f] || '—' }));

      if (otrosCambios.length > 0) {
        log.push(`CAMBIOS: ${ref.nombreProducto} [${otrosCambios.map(c => c.campo).join(', ')}]`);
        emailTasks.push(sendActualizacionGeneral(ref, otrosCambios));
      }
    }

    // Enviar todos los emails y actualizar snapshots en paralelo
    const [emailResults] = await Promise.allSettled([
      Promise.allSettled(emailTasks),
      upsertSnapshots(current),
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
  }
});

module.exports = router;
