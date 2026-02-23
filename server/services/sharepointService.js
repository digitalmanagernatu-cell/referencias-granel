const { ConfidentialClientApplication } = require('@azure/msal-node');
const axios = require('axios');

const TENANT_ID = process.env.TENANT_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SITE_ID = process.env.SITE_ID;
const FILE_ID = process.env.FILE_ID;

// Row index (1-based) where 2026 data starts in the Excel sheet.
// Row 56 in the spreadsheet corresponds to index 55 (0-based), but the
// Graph API /values range uses row numbers directly so we address it as
// a named range below.
const DATA_START_ROW = 56;

// Excel column mapping (1-based index → field name)
const COLUMNS = [
  'numero',              // A - Nº
  'nombreComercial',     // B - NOMBRE DEL COMERCIAL
  'tipoProducto',        // C - TIPO PRODUCTO
  'categoria',           // D - CATEGORIA
  'nombreProducto',      // E - NOMBRE DEL PRODUCTO
  'nRefAsignado',        // F - Nº REF ASIGNADO
  'nombreCliente',       // G - NOMBRE CLIENTE
  'peticionFechaLanzamiento', // H - PETICIÓN FECHA LANZAMIENTO
  'fechaSolicitudComercial',  // I - FECHA SOLICITUD COMERCIAL
  'proveedor',           // J - PROVEEDOR
  'fechaSolicitudProveedor',  // K - FECHA DE SOLICITUD AL PROVEEDOR
  'fechaLlegadaPropuesta',    // L - FECHA LLEGADA PROPUESTA
  'estado',              // M - ESTADO
  'fechaValidacionNatu', // N - FECHA DE VALIDACION NATU
  'muestrasLaboratorio', // O - MUESTRAS LABORATORIO
  'enlaces',             // P - ENLACES
];

// ─── MSAL client ───────────────────────────────────────────────────────────
let msalClient = null;

function getMsalClient() {
  if (!msalClient) {
    if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
      throw new Error(
        'Faltan variables de entorno: TENANT_ID, CLIENT_ID o CLIENT_SECRET'
      );
    }
    msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: CLIENT_ID,
        authority: `https://login.microsoftonline.com/${TENANT_ID}`,
        clientSecret: CLIENT_SECRET,
      },
    });
  }
  return msalClient;
}

async function getAccessToken() {
  const client = getMsalClient();
  const result = await client.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });
  if (!result || !result.accessToken) {
    throw new Error('No se pudo obtener el token de acceso de Azure AD');
  }
  return result.accessToken;
}

// ─── Graph API helpers ─────────────────────────────────────────────────────
function graphUrl(path) {
  return `https://graph.microsoft.com/v1.0${path}`;
}

async function graphGet(path) {
  const token = await getAccessToken();
  const response = await axios.get(graphUrl(path), {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

async function graphPost(path, body) {
  const token = await getAccessToken();
  const response = await axios.post(graphUrl(path), body, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data;
}

async function graphPatch(path, body) {
  const token = await getAccessToken();
  const response = await axios.patch(graphUrl(path), body, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data;
}

// ─── Worksheet helpers ─────────────────────────────────────────────────────
const WORKSHEET_BASE = `/sites/${SITE_ID}/drive/items/${FILE_ID}/workbook/worksheets('Hoja1')`;

/**
 * Fetch all used rows from DATA_START_ROW onwards.
 * We request the usedRange of the sheet and slice from the start row.
 */
async function fetchAllRows() {
  // Get used range of the entire worksheet
  const data = await graphGet(`${WORKSHEET_BASE}/usedRange`);
  const allValues = data.values; // 2D array, row-major

  if (!allValues || allValues.length < DATA_START_ROW) {
    return [];
  }

  // Slice from DATA_START_ROW - 1 (0-based) to end
  const dataRows = allValues.slice(DATA_START_ROW - 1);

  return dataRows
    .map((row, idx) => rowToObject(row, DATA_START_ROW + idx))
    .filter((r) => !isRowEmpty(r));
}

/**
 * Find the next empty row after the data (1-based row number in the sheet).
 */
async function findNextEmptyRow() {
  const data = await graphGet(`${WORKSHEET_BASE}/usedRange`);
  const allValues = data.values || [];
  // Next row = total rows used + 1  (1-based)
  return allValues.length + 1;
}

/**
 * Write a single row of values at the given 1-based sheet row.
 * Addresses the range A{row}:P{row}
 */
async function writeRow(rowNumber, values) {
  const range = `A${rowNumber}:P${rowNumber}`;
  await graphPatch(
    `${WORKSHEET_BASE}/range(address='${encodeURIComponent(range)}')`,
    { values: [values] }
  );
}

// ─── Conversion helpers ─────────────────────────────────────────────────────
function rowToObject(row, sheetRowNumber) {
  const obj = { _sheetRow: sheetRowNumber };
  COLUMNS.forEach((col, i) => {
    obj[col] = row[i] !== undefined && row[i] !== null ? String(row[i]).trim() : '';
  });
  return obj;
}

function isRowEmpty(obj) {
  return COLUMNS.every((col) => !obj[col]);
}

function objectToRow(obj) {
  return COLUMNS.map((col) => obj[col] || '');
}

// ─── Public service methods ─────────────────────────────────────────────────

/**
 * GET all referencias from the Excel (rows >= DATA_START_ROW, non-empty).
 */
async function getReferencias() {
  return fetchAllRows();
}

/**
 * POST a new referencia row to the Excel.
 * @param {Object} data - fields matching the COLUMNS mapping
 */
async function addReferencia(data) {
  const nextRow = await findNextEmptyRow();
  const rowValues = objectToRow(data);
  await writeRow(nextRow, rowValues);
  return { sheetRow: nextRow, ...data };
}

module.exports = { getReferencias, addReferencia };
