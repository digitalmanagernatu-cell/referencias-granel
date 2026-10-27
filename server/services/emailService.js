const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.EMAIL_FROM || 'noreply@natuaromatic.com';
const TO = (process.env.EMAIL_TO || 'digitalmanager@natuaromatic.com')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);

function row(label, value) {
  if (!value) return '';
  return `
    <tr>
      <td style="padding:6px 12px;color:#6b7280;font-size:13px;white-space:nowrap">${label}</td>
      <td style="padding:6px 12px;color:#111827;font-size:13px">${value}</td>
    </tr>`;
}

function baseHtml({ title, color, icon, body }) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
        <!-- Header -->
        <tr>
          <td style="background:${color};padding:24px 32px">
            <p style="margin:0;font-size:22px;font-weight:700;color:#fff">${icon} ${title}</p>
            <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,.8)">Dashboard de Referencias Granel · NATU Lab</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:24px 32px 8px">
            ${body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px">
            Este es un aviso automático generado por el panel de Referencias Granel.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function refTable(ref) {
  return `
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-top:16px">
      <tbody>
        ${row('Producto', ref.nombreProducto)}
        ${row('Nº Ref.', ref.nRefAsignado || '—')}
        ${row('Comercial', ref.nombreComercial)}
        ${row('Tipo', ref.tipoProducto)}
        ${row('Categoría', ref.categoria)}
        ${row('Estado', ref.estado || 'PENDIENTE')}
        ${row('Fecha solicitud', ref.fechaSolicitudComercial)}
        ${row('Proveedor', ref.proveedor)}
        ${row('Cliente', ref.nombreCliente)}
      </tbody>
    </table>`;
}

async function sendNuevaReferencia(referencia) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[emailService] RESEND_API_KEY no configurada — email omitido');
    return;
  }
  const nombre = referencia.nombreProducto || 'Nueva referencia';
  await resend.emails.send({
    from: FROM,
    to: TO,
    subject: `Nueva solicitud de referencia: ${nombre}`,
    html: baseHtml({
      title: 'Nueva solicitud de referencia',
      color: '#2563eb',
      icon: '📋',
      body: `
        <p style="margin:0;color:#374151;font-size:14px">
          Se ha registrado una nueva solicitud de referencia en el panel.
        </p>
        ${refTable(referencia)}`,
    }),
  });
}

async function sendCambioEstado(referencia, estadoAnterior, estadoNuevo) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[emailService] RESEND_API_KEY no configurada — email omitido');
    return;
  }
  const nombre = referencia.nombreProducto || 'Referencia';
  await resend.emails.send({
    from: FROM,
    to: TO,
    subject: `Cambio de estado: ${nombre} → ${estadoNuevo}`,
    html: baseHtml({
      title: 'Cambio de estado',
      color: '#7c3aed',
      icon: '🔄',
      body: `
        <p style="margin:0;color:#374151;font-size:14px">
          El estado de una referencia ha cambiado de
          <strong>${estadoAnterior || 'Sin estado'}</strong>
          a <strong>${estadoNuevo}</strong>.
        </p>
        ${refTable({ ...referencia, estado: estadoNuevo })}`,
    }),
  });
}

async function sendNuevoComentario(referencia, comentario) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[emailService] RESEND_API_KEY no configurada — email omitido');
    return;
  }
  const nombre = referencia.nombreProducto || 'Referencia';
  await resend.emails.send({
    from: FROM,
    to: TO,
    subject: `Nuevo comentario en: ${nombre}`,
    html: baseHtml({
      title: 'Nuevo comentario',
      color: '#059669',
      icon: '💬',
      body: `
        <p style="margin:0;color:#374151;font-size:14px">
          Se ha añadido un comentario a una referencia.
        </p>
        <blockquote style="margin:16px 0;padding:12px 16px;background:#f9fafb;border-left:4px solid #059669;border-radius:4px;color:#374151;font-size:14px">
          ${comentario}
        </blockquote>
        ${refTable(referencia)}`,
    }),
  });
}

module.exports = { sendNuevaReferencia, sendCambioEstado, sendNuevoComentario };
