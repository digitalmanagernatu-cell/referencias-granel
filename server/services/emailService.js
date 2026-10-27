const axios = require('axios');
const fs = require('fs');
const path = require('path');

const FROM = process.env.EMAIL_FROM || 'noreply@natulaboratories.es';

function parseEmails(str) {
  return (str || '').split(',').map(e => e.trim()).filter(Boolean);
}

// Grupos de destinatarios — configurables por env vars con fallback a EMAIL_TO
const TO_ALL      = parseEmails(process.env.EMAIL_TO || 'digitalmanager@natuaromatic.com');
const TO_COMERCIAL = parseEmails(process.env.EMAIL_TO_COMERCIAL || process.env.EMAIL_TO || 'digitalmanager@natuaromatic.com');
const TO_CALIDAD   = parseEmails(process.env.EMAIL_TO_CALIDAD   || process.env.EMAIL_TO || 'digitalmanager@natuaromatic.com');

// Emails individuales del equipo comercial (para excluir al autor y avisar a sus compañeros)
const COMERCIAL_MAP = {
  'toni':  'antoniofuentes@natuaromatic.com',
  'mauro': 'export4@natuaromatic.com',
  'jaime': 'jaime@natuaromatic.com',
};
const NOMBRES_LAB = ['laboratorio'];

// Comercial minus el autor = los otros dos compañeros
function otrosComerciales(autor) {
  const n = autor.trim().toLowerCase();
  return Object.entries(COMERCIAL_MAP)
    .filter(([k]) => k !== n)
    .map(([, email]) => email);
}

// Nueva referencia:
//   comercial sube → calidad + los otros dos comerciales
//   lab sube       → comercial completo
//   otro           → todos
function recipientsNuevaRef(nombreComercial) {
  const n = (nombreComercial || '').trim().toLowerCase();
  if (COMERCIAL_MAP[n]) return [...TO_CALIDAD, ...otrosComerciales(n)];
  if (NOMBRES_LAB.includes(n)) return TO_COMERCIAL;
  return TO_ALL;
}

// Cambio de estado:
//   lab cambia              → avisar a comercial
//   comercial descarta      → avisar a calidad
//   comercial otro estado   → sin email
//   desconocido             → todos
function recipientsCambioEstado(nombreComercial, estadoNuevo) {
  const n = (nombreComercial || '').trim().toLowerCase();
  const descartado = (estadoNuevo || '').trim().toUpperCase() === 'DESCARTADO';
  if (NOMBRES_LAB.includes(n))                     return TO_COMERCIAL;
  if (COMERCIAL_MAP[n] && descartado)              return TO_CALIDAD;
  if (COMERCIAL_MAP[n] && !descartado)             return [];
  return TO_ALL;
}

// Logo embebido en base64 para compatibilidad con todos los clientes de email
let LOGO_B64 = '';
try {
  const logoPath = path.join(__dirname, '../../client/public/logo.png');
  LOGO_B64 = fs.readFileSync(logoPath).toString('base64');
} catch (_) { /* logo opcional */ }

const LOGO_SRC = LOGO_B64
  ? `data:image/png;base64,${LOGO_B64}`
  : '';

// Verde corporativo NATU
const BRAND_GREEN = '#3E3F3E';
const BRAND_GREEN_LIGHT = '#f0f4f0';

function row(label, value) {
  if (!value) return '';
  return `
    <tr>
      <td style="padding:6px 12px;color:#6b7280;font-size:13px;white-space:nowrap">${label}</td>
      <td style="padding:6px 12px;color:#111827;font-size:13px">${value}</td>
    </tr>`;
}

function baseHtml({ title, accentColor, body }) {
  const logoHtml = LOGO_SRC
    ? `<img src="${LOGO_SRC}" alt="NATU Lab" height="52" style="display:block;height:52px;width:auto;margin-bottom:14px">`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
        <!-- Franja de acento superior -->
        <tr><td style="background:${accentColor};height:5px;font-size:0;line-height:0">&nbsp;</td></tr>
        <!-- Cabecera -->
        <tr>
          <td style="background:${BRAND_GREEN_LIGHT};padding:24px 32px;border-bottom:1px solid #e2e8f0">
            ${logoHtml}
            <p style="margin:0;font-size:20px;font-weight:700;color:#111827">${title}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#6b7280;letter-spacing:.3px">Dashboard de Referencias Granel · NATU Lab</p>
          </td>
        </tr>
        <!-- Cuerpo -->
        <tr><td style="padding:24px 32px 8px">${body}</td></tr>
        <!-- Pie -->
        <tr>
          <td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px">
            Aviso automático del panel de Referencias Granel.
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

async function sendMail({ subject, html, to }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[emailService] RESEND_API_KEY no configurada — email omitido');
    return;
  }
  const recipients = (to && to.length) ? to : TO_ALL;
  if (!recipients.length) return;
  await axios.post(
    'https://api.resend.com/emails',
    { from: `Referencias Granel <${FROM}>`, to: recipients, subject, html },
    { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
  );
}

async function sendNuevaReferencia(referencia) {
  const nombre = referencia.nombreProducto || 'Nueva referencia';
  await sendMail({
    subject: `Nueva solicitud de referencia: ${nombre}`,
    to: recipientsNuevaRef(referencia.nombreComercial),
    html: baseHtml({
      title: 'Nueva solicitud de referencia',
      accentColor: '#2563eb',
      body: `<p style="margin:0;color:#374151;font-size:14px">Se ha registrado una nueva solicitud de referencia en el panel.</p>${refTable(referencia)}`,
    }),
  });
}

async function sendEnlaceActualizado(referencia) {
  const nombre = referencia.nombreProducto || 'Referencia';
  await sendMail({
    subject: `Enlace Fragrantica añadido: ${nombre}`,
    html: baseHtml({
      title: 'Enlace Fragrantica añadido',
      accentColor: '#0284c7',
      body: `<p style="margin:0;color:#374151;font-size:14px">Se ha añadido un enlace de Fragrantica a una referencia.</p>${refTable(referencia)}`,
    }),
  });
}

async function sendNRefAsignado(referencia, nRef) {
  const nombre = referencia.nombreProducto || 'Referencia';
  await sendMail({
    subject: `Nº Ref asignado: ${nRef} — ${nombre}`,
    html: baseHtml({
      title: 'Nº Referencia asignado',
      accentColor: '#059669',
      body: `<p style="margin:0;color:#374151;font-size:14px">Se ha asignado el número de referencia <strong>${nRef}</strong> a una solicitud.</p>${refTable({ ...referencia, nRefAsignado: nRef })}`,
    }),
  });
}

async function sendCambioEstado(referencia, estadoAnterior, estadoNuevo) {
  const to = recipientsCambioEstado(referencia.nombreComercial, estadoNuevo);
  if (!to.length) return; // este cambio no requiere notificación
  const nombre = referencia.nombreProducto || 'Referencia';
  await sendMail({
    subject: `Cambio de estado: ${nombre} → ${estadoNuevo}`,
    to,
    html: baseHtml({
      title: 'Cambio de estado',
      accentColor: '#7c3aed',
      body: `<p style="margin:0;color:#374151;font-size:14px">El estado ha cambiado de <strong>${estadoAnterior || 'Sin estado'}</strong> a <strong>${estadoNuevo}</strong>.</p>${refTable({ ...referencia, estado: estadoNuevo })}`,
    }),
  });
}

async function sendNuevoComentario(referencia, comentario) {
  const nombre = referencia.nombreProducto || 'Referencia';
  await sendMail({
    subject: `Nuevo comentario en: ${nombre}`,
    html: baseHtml({
      title: 'Nuevo comentario',
      accentColor: '#059669',
      body: `<p style="margin:0;color:#374151;font-size:14px">Se ha añadido un comentario a una referencia.</p><blockquote style="margin:16px 0;padding:12px 16px;background:#f9fafb;border-left:4px solid #059669;border-radius:4px;color:#374151;font-size:14px">${comentario}</blockquote>${refTable(referencia)}`,
    }),
  });
}

async function sendActualizacionGeneral(referencia, cambios) {
  const nombre = referencia.nombreProducto || 'Referencia';
  const camposHtml = cambios.map(c => `
    <tr>
      <td style="padding:6px 12px;color:#6b7280;font-size:13px;white-space:nowrap">${c.campo}</td>
      <td style="padding:6px 12px;color:#dc2626;font-size:13px;text-decoration:line-through">${c.antes}</td>
      <td style="padding:6px 12px;color:#16a34a;font-size:13px">${c.despues}</td>
    </tr>`).join('');
  await sendMail({
    subject: `Actualización en referencia: ${nombre}`,
    html: baseHtml({
      title: 'Referencia actualizada',
      accentColor: '#d97706',
      body: `
        <p style="margin:0;color:#374151;font-size:14px">Se han modificado campos de una referencia.</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-top:16px">
          <thead>
            <tr style="background:#f9fafb">
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">Campo</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">Antes</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">Ahora</th>
            </tr>
          </thead>
          <tbody>${camposHtml}</tbody>
        </table>
        ${refTable(referencia)}`,
    }),
  });
}

module.exports = { sendNuevaReferencia, sendEnlaceActualizado, sendNRefAsignado, sendCambioEstado, sendNuevoComentario, sendActualizacionGeneral };
