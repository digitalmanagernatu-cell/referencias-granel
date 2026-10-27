const nodemailer = require('nodemailer');

const TO = (process.env.EMAIL_TO || 'digitalmanager@natuaromatic.com')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

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
        <tr>
          <td style="background:${color};padding:24px 32px">
            <p style="margin:0;font-size:22px;font-weight:700;color:#fff">${icon} ${title}</p>
            <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,.8)">Dashboard de Referencias Granel · NATU Lab</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 8px">
            ${body}
          </td>
        </tr>
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

async function sendMail({ subject, html }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn('[emailService] GMAIL_USER / GMAIL_APP_PASSWORD no configuradas — email omitido');
    return;
  }
  await transporter.sendMail({
    from: `Referencias Granel <${process.env.GMAIL_USER}>`,
    to: TO.join(', '),
    subject,
    html,
  });
}

async function sendNuevaReferencia(referencia) {
  const nombre = referencia.nombreProducto || 'Nueva referencia';
  await sendMail({
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
  const nombre = referencia.nombreProducto || 'Referencia';
  await sendMail({
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
  const nombre = referencia.nombreProducto || 'Referencia';
  await sendMail({
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
