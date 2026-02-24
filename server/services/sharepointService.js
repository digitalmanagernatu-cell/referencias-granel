const { ConfidentialClientApplication } = require('@azure/msal-node');
const axios = require('axios');
const XLSX = require('xlsx');

const TENANT_ID = process.env.TENANT_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SITE_ID = process.env.SITE_ID;
const FILE_ID = process.env.FILE_ID;
const FILE_PATH = process.env.FILE_PATH;
const DRIVE_ID = process.env.DRIVE_ID;
const SHAREPOINT_HOST = process.env.SHAREPOINT_HOST;

// Row index (1-based) where 2026 data starts in the Excel sheet.
const DATA_START_ROW = 56;

// Excel column mapping (0-based index → field name)
const COLUMNS = [
  'numero',              // A
  'nombreComercial',     // B
  'tipoProducto',        // C
  'categoria',           // D
  'nombreProducto',      // E
  'nRefAsignado',        // F
  'nombreCliente',       // G
  'peticionFechaLanzamiento', // H
  'fechaSolicitudComercial',  // I
  'proveedor',           // J
  'fechaSolicitudProveedor',  // K
  'fechaLlegadaPropuesta',    // L
  'estado',              // M
  'fechaValidacionNatu', // N
  'muestrasLaboratorio', // O
  'enlaces',             // P
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

function handleAxiosError(err) {
  if (err.response) {
    const { status, data } = err.response;
    const detail = data && data.error
      ? `${data.error.code}: ${data.error.message}`
      : JSON.stringify(data);
    const reqUrl = err.config && err.config.url ? err.config.url : '';
    const e = new Error(`Graph API ${status} - ${detail} [URL: ${reqUrl}]`);
    e.status = status;
    throw e;
  }
  throw err;
}

async function graphGet(path) {
  const token = await getAccessToken();
  try {
    const response = await axios.get(graphUrl(path), {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (err) { handleAxiosError(err); }
}

// ─── File path helpers ─────────────────────────────────────────────────────
function encodePath(p) {
  return p.split('/').map(encodeURIComponent).join('/');
}

function getDriveBase() {
  if (FILE_ID) return `/sites/${SITE_ID}/drive/items/${FILE_ID}`;
  if (DRIVE_ID) {
    const encoded = encodePath(FILE_PATH);
    return `/sites/${SITE_ID}/drives/${DRIVE_ID}/root:${encoded}`;
  }
  if (FILE_PATH) {
    const encoded = encodePath(FILE_PATH);
    return `/sites/${SITE_ID}/drive/root:${encoded}`;
  }
  throw new Error('Falta variable de entorno: FILE_ID, DRIVE_ID+FILE_PATH, o FILE_PATH');
}

// Returns the Graph API path for downloading/uploading the raw file binary.
function getFileContentPath() {
  if (FILE_ID) return `/sites/${SITE_ID}/drive/items/${FILE_ID}/content`;
  if (DRIVE_ID) return `/sites/${SITE_ID}/drives/${DRIVE_ID}/root:${encodePath(FILE_PATH)}:/content`;
  if (FILE_PATH) return `/sites/${SITE_ID}/drive/root:${encodePath(FILE_PATH)}:/content`;
  throw new Error('Falta variable de entorno: FILE_ID, DRIVE_ID+FILE_PATH, o FILE_PATH');
}

// ─── Download / Upload ─────────────────────────────────────────────────────
async function downloadExcel() {
  const token = await getAccessToken();
  try {
    const response = await axios.get(graphUrl(getFileContentPath()), {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'arraybuffer',
      maxRedirects: 5,
    });
    return Buffer.from(response.data);
  } catch (err) { handleAxiosError(err); }
}

async function uploadExcel(buffer) {
  const token = await getAccessToken();
  try {
    await axios.put(graphUrl(getFileContentPath()), buffer, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
  } catch (err) { handleAxiosError(err); }
}

// ─── XLSX parsing ──────────────────────────────────────────────────────────
const SHEET_NAME = 'NUEVAS REFERENCIAS';

function parseSheet(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) {
    const names = workbook.SheetNames.join(', ');
    throw new Error(
      `Hoja "${SHEET_NAME}" no encontrada. Hojas disponibles: ${names}`
    );
  }
  // header: 1 → returns 2D array; raw: false → formatted strings (like what Excel shows)
  const allValues = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });
  return { workbook, sheet, allValues };
}

// ─── Normalization ──────────────────────────────────────────────────────────
// Canonical names for common misspellings / abbreviations in the Excel data
const TIPO_NORMALIZACION = {
  'BDY MIST': 'BODY MIST',
  'BODY MIST ': 'BODY MIST',
};

function normalizeTipo(raw) {
  if (!raw) return '';
  const upper = raw.trim().toUpperCase();
  return TIPO_NORMALIZACION[upper] || raw.trim();
}

// ─── Conversion helpers ────────────────────────────────────────────────────
function rowToObject(row, sheetRowNumber) {
  const obj = { _sheetRow: sheetRowNumber };
  COLUMNS.forEach((col, i) => {
    let val = row[i] !== undefined && row[i] !== null ? String(row[i]).trim() : '';
    if (col === 'tipoProducto') val = normalizeTipo(val);
    obj[col] = val;
  });
  return obj;
}

// A row is valid only when it has a product name — filters out year headers
// (e.g. a cell that says "2026") and any other separator rows.
function isRowEmpty(obj) {
  return !obj.nombreProducto;
}

function objectToRow(obj) {
  return COLUMNS.map((col) => obj[col] || '');
}

// ─── Public service methods ─────────────────────────────────────────────────

/**
 * GET all referencias from the Excel (rows >= DATA_START_ROW, non-empty).
 * Downloads the file binary and parses it locally — no WAC required.
 */
async function getReferencias() {
  const buffer = await downloadExcel();
  const { allValues } = parseSheet(buffer);

  if (allValues.length < DATA_START_ROW) return [];

  const dataRows = allValues.slice(DATA_START_ROW - 1);
  return dataRows
    .map((row, idx) => rowToObject(row, DATA_START_ROW + idx))
    .filter((r) => !isRowEmpty(r));
}

/**
 * POST a new referencia row to the Excel.
 * Downloads, appends the row, re-uploads — no WAC required.
 * @param {Object} data - fields matching the COLUMNS mapping
 */
async function addReferencia(data) {
  const buffer = await downloadExcel();
  const { workbook, sheet, allValues } = parseSheet(buffer);

  // Next empty row: 0-based index = current total used rows
  const nextRowIdx = allValues.length;
  const rowValues = objectToRow(data);

  COLUMNS.forEach((_col, colIdx) => {
    const cellRef = XLSX.utils.encode_cell({ r: nextRowIdx, c: colIdx });
    sheet[cellRef] = { v: rowValues[colIdx], t: 's' };
  });

  // Expand the sheet's declared range to include the new row
  const ref = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
  ref.e.r = Math.max(ref.e.r, nextRowIdx);
  ref.e.c = Math.max(ref.e.c, COLUMNS.length - 1);
  sheet['!ref'] = XLSX.utils.encode_range(ref);

  const newBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  await uploadExcel(newBuffer);

  return { sheetRow: nextRowIdx + 1, ...data }; // 1-based row number
}

/**
 * Step-by-step diagnostic: tests token, site, drives, file access, and download.
 */
async function diagnose() {
  const result = {
    env: {
      TENANT_ID: TENANT_ID ? '✓ set' : '✗ missing',
      CLIENT_ID: CLIENT_ID ? '✓ set' : '✗ missing',
      CLIENT_SECRET: CLIENT_SECRET ? '✓ set' : '✗ missing',
      SITE_ID: SITE_ID || '✗ missing',
      FILE_ID: FILE_ID || '(not set)',
      FILE_PATH: FILE_PATH || '(not set)',
      DRIVE_ID: DRIVE_ID || '(not set)',
    },
    constructedContentPath: null,
    steps: {},
  };

  try {
    result.constructedContentPath = getFileContentPath();
  } catch (e) {
    result.constructedContentPath = `ERROR: ${e.message}`;
  }

  // Step 1: token
  try {
    await getAccessToken();
    result.steps.token = 'OK';
  } catch (e) {
    result.steps.token = `FAIL: ${e.message}`;
    return result;
  }

  // Step 2: site
  try {
    const site = await graphGet(`/sites/${SITE_ID}`);
    result.steps.site = `OK - ${site.displayName || site.name || site.id}`;
  } catch (e) {
    result.steps.site = `FAIL: ${e.message}`;
    return result;
  }

  // Step 3: list all drives in the site
  try {
    const drivesRes = await graphGet(`/sites/${SITE_ID}/drives`);
    result.steps.drives = (drivesRes.value || []).map((d) => ({
      id: d.id,
      name: d.name,
      driveType: d.driveType,
    }));
  } catch (e) {
    result.steps.drives = `FAIL: ${e.message}`;
  }

  // Step 4: file metadata access
  const fileMetaUrl = FILE_ID
    ? `/sites/${SITE_ID}/drive/items/${FILE_ID}`
    : getDriveBase();
  try {
    const file = await graphGet(fileMetaUrl);
    result.steps.file = `OK - ${file.name || file.id}`;
  } catch (e) {
    result.steps.file = `FAIL: ${e.message}`;

    if (Array.isArray(result.steps.drives) && FILE_PATH) {
      const parts = FILE_PATH.replace(/^\//, '').split('/');
      const pathInsideLib = parts.length > 1 ? '/' + parts.slice(1).join('/') : FILE_PATH;
      const enc = encodePath(pathInsideLib);
      result.steps.driveSearch = {};
      for (const d of result.steps.drives) {
        try {
          const f = await graphGet(`/sites/${SITE_ID}/drives/${d.id}/root:${enc}`);
          result.steps.driveSearch[d.name] = `FOUND - ${f.name} (driveId: ${d.id})`;
        } catch (e2) {
          result.steps.driveSearch[d.name] = `not found (${e2.message.split(' - ')[0]})`;
        }
      }
    }

    if (SHAREPOINT_HOST && FILE_PATH) {
      const segments = FILE_PATH.replace(/^\//, '').split('/');
      const sitePath = segments[0];
      try {
        const altSite = await graphGet(`/sites/${SHAREPOINT_HOST}:/${sitePath}`);
        const altSiteId = altSite.id;
        result.steps.subsiteFound = {
          siteId: altSiteId,
          name: altSite.displayName || altSite.name,
          hint: `→ Update SITE_ID to: ${altSiteId}`,
        };
        const altDrivesRes = await graphGet(`/sites/${altSiteId}/drives`);
        const altDrives = altDrivesRes.value || [];
        result.steps.subsiteDrives = altDrives.map((d) => ({ id: d.id, name: d.name }));

        const pathVariants = [];
        for (let i = 1; i < segments.length; i++) {
          pathVariants.push('/' + segments.slice(i).join('/'));
        }
        result.steps.subsiteFileSearch = {};
        for (const d of altDrives) {
          let found = false;
          for (const variant of pathVariants) {
            try {
              const f = await graphGet(`/sites/${altSiteId}/drives/${d.id}/root:${encodePath(variant)}`);
              result.steps.subsiteFileSearch[d.name] = `FOUND at ${variant} | DRIVE_ID=${d.id} | SITE_ID=${altSiteId}`;
              found = true;
              break;
            } catch (_) { /* try next variant */ }
          }
          if (!found) result.steps.subsiteFileSearch[d.name] = 'not found';
        }
      } catch (e2) {
        result.steps.subsiteFound = `No subsite at /${sitePath}: ${e2.message}`;
      }
    }

    return result;
  }

  // Step 5: download the file binary and parse sheet names
  try {
    const buf = await downloadExcel();
    const workbook = XLSX.read(buf, { type: 'buffer' });
    result.steps.download = `OK - ${buf.length} bytes`;
    result.steps.sheetNames = workbook.SheetNames;
  } catch (e) {
    result.steps.download = `FAIL: ${e.message}`;
  }

  return result;
}

module.exports = { getReferencias, addReferencia, diagnose };
