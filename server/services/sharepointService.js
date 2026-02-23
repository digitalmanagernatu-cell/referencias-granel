const { ConfidentialClientApplication } = require('@azure/msal-node');
const axios = require('axios');

const TENANT_ID = process.env.TENANT_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SITE_ID = process.env.SITE_ID;
const FILE_ID = process.env.FILE_ID;
const FILE_PATH = process.env.FILE_PATH;
const DRIVE_ID = process.env.DRIVE_ID; // optional: specific document library drive ID
const SHAREPOINT_HOST = process.env.SHAREPOINT_HOST; // e.g. natuaromatic.sharepoint.com

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

async function graphPost(path, body) {
  const token = await getAccessToken();
  try {
    const response = await axios.post(graphUrl(path), body, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  } catch (err) { handleAxiosError(err); }
}

async function graphPatch(path, body) {
  const token = await getAccessToken();
  try {
    const response = await axios.patch(graphUrl(path), body, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  } catch (err) { handleAxiosError(err); }
}

// ─── Worksheet helpers ─────────────────────────────────────────────────────
// Encode a file path preserving slashes but encoding each segment
function encodePath(p) {
  return p.split('/').map(encodeURIComponent).join('/');
}

// Build the drive base prefix: either by DRIVE_ID, default drive, or item ID
function getDriveBase() {
  if (FILE_ID) return `/sites/${SITE_ID}/drive/items/${FILE_ID}`;
  if (DRIVE_ID) {
    // When DRIVE_ID is set, FILE_PATH must be the path *inside* that drive.
    // e.g. /01_GRANEL/02_ GRANEL ITALIA/.../NUEVOS DESARROLLOS GRANEL.xlsx
    const encoded = encodePath(FILE_PATH);
    return `/sites/${SITE_ID}/drives/${DRIVE_ID}/root:${encoded}`;
  }
  if (FILE_PATH) {
    const encoded = encodePath(FILE_PATH);
    return `/sites/${SITE_ID}/drive/root:${encoded}`;
  }
  throw new Error('Falta variable de entorno: FILE_ID, DRIVE_ID+FILE_PATH, o FILE_PATH');
}

function getWorksheetBase() {
  if (FILE_ID) {
    return `${getDriveBase()}/workbook/worksheets('NUEVAS REFERENCIAS')`;
  }
  return `${getDriveBase()}:/workbook/worksheets('NUEVAS REFERENCIAS')`;
}

/**
 * Fetch all used rows from DATA_START_ROW onwards.
 * We request the usedRange of the sheet and slice from the start row.
 */
async function fetchAllRows() {
  // Get used range of the entire worksheet
  const data = await graphGet(`${getWorksheetBase()}/usedRange`);
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
  const data = await graphGet(`${getWorksheetBase()}/usedRange`);
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
    `${getWorksheetBase()}/range(address='${encodeURIComponent(range)}')`,
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

/**
 * Step-by-step diagnostic: tests token, site, file, and worksheets.
 * Returns an object with results for each step.
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
    },
    constructedBase: null,
    steps: {},
  };

  // Show constructed URL
  try {
    result.constructedBase = getWorksheetBase();
  } catch (e) {
    result.constructedBase = `ERROR: ${e.message}`;
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

  // Step 3: list all drives in the site (to find the right library)
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

  // Step 4: try file access with current config
  const filePathUrl = FILE_ID
    ? `/sites/${SITE_ID}/drive/items/${FILE_ID}`
    : getDriveBase();
  const fileAccessUrl = FILE_ID ? filePathUrl : filePathUrl;
  try {
    const file = await graphGet(fileAccessUrl);
    result.steps.file = `OK - ${file.name || file.id}`;
  } catch (e) {
    result.steps.file = `FAIL: ${e.message}`;

    // Also try each drive with FILE_PATH (minus first segment) to find it
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

    // Try to find the site using SHAREPOINT_HOST + first path segment
    // e.g. FILE_PATH=/mkt/Catalogos/... → look for site at /mkt
    if (SHAREPOINT_HOST && FILE_PATH) {
      const segments = FILE_PATH.replace(/^\//, '').split('/');
      const sitePath = segments[0]; // 'mkt'
      const fileInSite = '/' + segments.slice(1).join('/'); // '/Catalogos/...'

      try {
        const altSite = await graphGet(`/sites/${SHAREPOINT_HOST}:/${sitePath}`);
        const altSiteId = altSite.id;
        result.steps.subsiteFound = {
          siteId: altSiteId,
          name: altSite.displayName || altSite.name,
          hint: `→ Update SITE_ID to: ${altSiteId}`,
        };

        // List drives in that subsite
        const altDrivesRes = await graphGet(`/sites/${altSiteId}/drives`);
        const altDrives = altDrivesRes.value || [];
        result.steps.subsiteDrives = altDrives.map((d) => ({ id: d.id, name: d.name }));

        // Search the file in each drive of the subsite, trying multiple path depths.
        // e.g. /Catalogos/01_GRANEL/... OR /01_GRANEL/... (when drive IS "Catalogos")
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

        // List root folders of the "Catálogos" drive to aid manual diagnosis
        const catalogsDrive = altDrives.find((d) =>
          d.name.toLowerCase().replace(/[áa]/g, 'a') === 'catalogos'
        );
        if (catalogsDrive) {
          try {
            const rootItems = await graphGet(`/sites/${altSiteId}/drives/${catalogsDrive.id}/root/children`);
            result.steps.catalogsRootFolders = (rootItems.value || []).map((i) => i.name);
          } catch (_) { /* ignore */ }
        }
      } catch (e2) {
        result.steps.subsiteFound = `No subsite at /${sitePath}: ${e2.message}`;
      }
    }

    return result;
  }

  // Step 5: list worksheets
  const wbBase = FILE_ID
    ? `/sites/${SITE_ID}/drive/items/${FILE_ID}`
    : getDriveBase();
  const wbPath = FILE_ID
    ? `${wbBase}/workbook/worksheets`
    : `${wbBase}:/workbook/worksheets`;
  try {
    const wb = await graphGet(wbPath);
    result.steps.worksheets = (wb.value || []).map((w) => w.name);
  } catch (e) {
    result.steps.worksheets = `FAIL: ${e.message}`;
  }

  return result;
}

module.exports = { getReferencias, addReferencia, diagnose };
