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
  'tipoFragancia',       // D  ← nueva columna (FEMENINO/MASCULINO/UNISEX)
  'categoria',           // E
  'nombreProducto',      // F
  'nRefAsignado',        // G
  'nombreCliente',       // H
  'peticionFechaLanzamiento', // I
  'fechaSolicitudComercial',  // J
  'proveedor',           // K
  'fechaSolicitudProveedor',  // L
  'fechaLlegadaPropuesta',    // M
  'estado',              // N
  'fechaValidacionNatu', // O
  'muestrasLaboratorio', // P
  'enlaces',             // Q
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadExcel(buffer) {
  const token = await getAccessToken();
  const url = graphUrl(getFileContentPath());
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };

  // Retry up to 3 times on 423 (file locked) with exponential backoff: 3s, 6s, 12s
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await axios.put(url, buffer, {
        headers,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      return; // success
    } catch (err) {
      const status = err.response && err.response.status;
      const isLocked = status === 423;
      const isLastAttempt = attempt === MAX_RETRIES;

      if (isLocked && !isLastAttempt) {
        console.warn(`[uploadExcel] Archivo bloqueado (423), reintento ${attempt}/${MAX_RETRIES - 1}...`);
        await sleep(3000 * attempt); // 3s, 6s
        continue;
      }

      if (isLocked) {
        const e = new Error(
          'El archivo Excel está siendo utilizado por otro usuario en este momento. ' +
          'Cierra el archivo en Excel/SharePoint y vuelve a intentarlo en unos segundos.'
        );
        e.status = 423;
        throw e;
      }

      handleAxiosError(err);
    }
  }
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

// ─── Workbook session API ───────────────────────────────────────────────────

function getWorkbookBase() {
  if (FILE_ID) return `/sites/${SITE_ID}/drive/items/${FILE_ID}/workbook`;
  if (DRIVE_ID) return `/sites/${SITE_ID}/drives/${DRIVE_ID}/root:${encodePath(FILE_PATH)}:/workbook`;
  return `/sites/${SITE_ID}/drive/root:${encodePath(FILE_PATH)}:/workbook`;
}

/**
 * Retry a Graph API call on transient failures (423 locked, 429 rate-limit, 503).
 * Uses exponential back-off: base * 2^(attempt-1) ms.
 */
async function withRetry(fn, label, maxAttempts = 4, baseMs = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err.response && err.response.status;
      const retryable = status === 423 || status === 429 || status === 503;
      if (retryable && attempt < maxAttempts) {
        const delay = baseMs * Math.pow(2, attempt - 1);
        console.warn(`[${label}] attempt ${attempt} failed (${status}), retry in ${delay}ms`);
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
}

/**
 * Appends a row to the Excel file via the Graph Workbook API.
 *
 * Design:
 * - Tries to open a persistent session (best for write atomicity).
 * - If createSession returns 423/locked, proceeds sessionless — Microsoft
 *   creates a temporary auto-session per-request, which merges safely even
 *   when another user has the file open in Excel Online.
 * - Both createSession and the write PATCH are retried on transient errors
 *   (423/429/503) with exponential back-off.
 * - Last data row is located by scanning column E (nombreProducto) from
 *   DATA_START_ROW, ignoring header rows and formatting-only empty rows.
 * - Duplicate detection: throws {code:'DUPLICATE'} if the same product name
 *   already exists in column E (case-insensitive).
 *
 * @param {string[]} rowValues  Array of cell values (must match COLUMNS length)
 * @param {string}   nombreProducto  Used for duplicate detection
 */
async function appendRowViaWorkbookSession(rowValues, nombreProducto) {
  const token = await getAccessToken();
  const workbookBase = getWorkbookBase();
  const base = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const sheetBase = `${workbookBase}/worksheets('${encodeURIComponent(SHEET_NAME)}')`;

  // ── 1. Create persistent session (retry on transient lock) ────────────────
  let sessionId = null;
  try {
    const res = await withRetry(
      () => axios.post(graphUrl(`${workbookBase}/createSession`), { persistChanges: true }, { headers: base }),
      'createSession'
    );
    sessionId = res.data.id;
  } catch (err) {
    const status = err.response && err.response.status;
    if (status === 423) {
      // Persistent session unavailable — fall through to sessionless mode.
      // Microsoft creates a temporary auto-session per-request; writes still
      // land in the file even when another user's session is active.
      console.warn('[appendRowViaWorkbookSession] createSession 423 – proceeding sessionless');
    } else {
      throw err;
    }
  }

  const reqHeaders = sessionId
    ? { ...base, 'workbook-session-id': sessionId }
    : base;

  async function closeSession() {
    if (!sessionId) return;
    try { await axios.post(graphUrl(`${workbookBase}/closeSession`), {}, { headers: reqHeaders }); }
    catch (_) { /* best-effort */ }
  }

  try {
    // ── 2. Scan nombreProducto column to find last real data row + duplicate ──
    // Derive column letter dynamically so adding/removing columns never breaks this.
    const npIdx = COLUMNS.indexOf('nombreProducto'); // 5 → col F
    const npCol = String.fromCharCode(65 + npIdx);   // 'F'
    const searchRange = `${npCol}${DATA_START_ROW}:${npCol}${DATA_START_ROW + 500}`;
    const colERes = await withRetry(
      () => axios.get(graphUrl(`${sheetBase}/range(address='${searchRange}')`), { headers: reqHeaders }),
      'readColE'
    );
    const eValues = colERes.data.values; // [[val], [val], …]

    const newNameNorm = (nombreProducto || '').trim().toLowerCase();
    let lastFilledIdx = -1;

    for (let i = 0; i < eValues.length; i++) {
      const cell = eValues[i][0];
      if (!cell || !String(cell).trim()) continue;
      const existing = String(cell).trim();
      // Duplicate check (case-insensitive)
      if (existing.toLowerCase() === newNameNorm) {
        const dup = new Error(
          `La referencia "${nombreProducto}" ya está solicitada (fila ${DATA_START_ROW + i})`
        );
        dup.code = 'DUPLICATE';
        throw dup;
      }
      lastFilledIdx = i;
    }

    const nextRow = DATA_START_ROW + lastFilledIdx + 1; // 1-based

    // ── 3. Write new row (retry on transient lock) ────────────────────────────
    const lastCol = String.fromCharCode(64 + COLUMNS.length); // 'P' for 16 cols
    const address = `A${nextRow}:${lastCol}${nextRow}`;
    await withRetry(
      () => axios.patch(
        graphUrl(`${sheetBase}/range(address='${address}')`),
        { values: [rowValues] },
        { headers: reqHeaders }
      ),
      'writeRow',
      4,   // max attempts
      500  // shorter base (500ms, 1s, 2s, 4s)
    );

    await closeSession();
    return nextRow;
  } catch (err) {
    await closeSession();
    throw err;
  }
}

/**
 * POST a new referencia row to the Excel.
 *
 * Uses the Workbook API as primary path — does NOT replace the file binary,
 * so it works even when another user has the file open in Excel/Excel Online.
 * Server-side retries handle transient 423 / notAllowed locking errors.
 *
 * Auth-only fallback (403/401): falls back to download → modify → re-upload,
 * which is only reached when the Workbook API is blocked by app permissions.
 * New solicitudes always receive estado = 'PENDIENTE'.
 *
 * @param {Object} data  Fields matching the COLUMNS mapping
 */
async function addReferencia(data) {
  const dataWithDefaults = {
    ...data,
    estado: data.estado || 'PENDIENTE',
    peticionFechaLanzamiento: data.peticionFechaLanzamiento || 'NO INDICADO',
  };
  const rowValues = objectToRow(dataWithDefaults);
  const nombreProducto = data.nombreProducto || '';

  // ── Primary path: Workbook API (no binary replacement) ────────────────────
  try {
    const sheetRow = await appendRowViaWorkbookSession(rowValues, nombreProducto);
    return { sheetRow, ...dataWithDefaults };
  } catch (workbookErr) {
    if (workbookErr.code === 'DUPLICATE') throw workbookErr; // propagate as-is

    const status = workbookErr.response && workbookErr.response.status;
    const isAuthBlock = status === 401 || status === 403;
    if (!isAuthBlock) {
      // Surface the real error (could be workbook API misconfigured, sheet not found, etc.)
      const msg = workbookErr.response
        ? `${workbookErr.response.status} – ${JSON.stringify(workbookErr.response.data)}`
        : workbookErr.message;
      const e = new Error(`No se pudo guardar en el Excel: ${msg}`);
      e.status = status || 500;
      throw e;
    }
    console.warn('[addReferencia] Workbook API bloqueada por permisos (%d), usando descarga/subida', status);
  }

  // ── Auth fallback: download → parse → modify → upload ─────────────────────
  // (only reached when app-only auth is blocked from using the Workbook API)
  const buffer = await downloadExcel();
  const { workbook, sheet, allValues } = parseSheet(buffer);

  const nombreProductoIdx = COLUMNS.indexOf('nombreProducto'); // col E
  let lastDataRowIdx = DATA_START_ROW - 2; // 0-based, just before data area
  const newNameNorm = nombreProducto.trim().toLowerCase();

  for (let i = DATA_START_ROW - 1; i < allValues.length; i++) {
    const existing = allValues[i] && allValues[i][nombreProductoIdx]
      ? String(allValues[i][nombreProductoIdx]).trim()
      : '';
    if (!existing) continue;
    if (existing.toLowerCase() === newNameNorm) {
      const dup = new Error(`La referencia "${nombreProducto}" ya está solicitada`);
      dup.code = 'DUPLICATE';
      throw dup;
    }
    lastDataRowIdx = i;
  }

  const nextRowIdx = lastDataRowIdx + 1; // 0-based

  COLUMNS.forEach((_col, colIdx) => {
    const cellRef = XLSX.utils.encode_cell({ r: nextRowIdx, c: colIdx });
    sheet[cellRef] = { v: rowValues[colIdx], t: 's' };
  });

  const ref = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
  ref.e.r = Math.max(ref.e.r, nextRowIdx);
  ref.e.c = Math.max(ref.e.c, COLUMNS.length - 1);
  sheet['!ref'] = XLSX.utils.encode_range(ref);

  const newBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  await uploadExcel(newBuffer);

  return { sheetRow: nextRowIdx + 1, ...dataWithDefaults };
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
