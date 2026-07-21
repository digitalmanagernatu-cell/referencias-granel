const { ConfidentialClientApplication } = require('@azure/msal-node');
const axios = require('axios');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');

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
  'notasLaboratorio',    // R - nueva columna
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

/**
 * Decode the JWT access token (without verifying) and return the
 * application permissions (roles) that Azure has actually granted.
 */
async function getTokenPermissions() {
  try {
    const token = await getAccessToken();
    const raw = token.split('.')[1];
    // base64url → base64 → parse
    const padded = raw.replace(/-/g, '+').replace(/_/g, '/').padEnd(
      raw.length + (4 - (raw.length % 4)) % 4, '='
    );
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    const roles = payload.roles || [];
    const hasWorkbookWrite = roles.includes('Sites.ReadWrite.All') || roles.includes('Files.ReadWrite.All');
    return {
      appId: payload.appid || payload.azp || '?',
      tenantId: payload.tid || '?',
      roles,
      hasWorkbookWrite,
      verdict: hasWorkbookWrite
        ? '✓ Permisos de escritura Workbook OK'
        : '✗ FALTA Sites.ReadWrite.All → el Workbook API (WAC) no funcionará',
    };
  } catch (e) {
    return { error: `No se pudo decodificar el token: ${e.message}` };
  }
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

// Date columns that may come from Excel in M/D/YY (US) format
const DATE_COLUMNS = new Set([
  'fechaSolicitudComercial', 'fechaSolicitudProveedor',
  'fechaLlegadaPropuesta', 'fechaValidacionNatu',
]);

/**
 * Converts M/D/YY or M/D/YYYY → DD/MM/YYYY.
 * If the value is already DD/MM/YYYY (first segment > 12) it is left alone.
 * Non-date strings are returned unchanged.
 */
function fixDateFormat(val) {
  if (!val) return val;
  const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return val;
  const p1 = parseInt(m[1], 10);
  const p2 = parseInt(m[2], 10);
  const rawYear = m[3];
  const year = rawYear.length === 2
    ? (parseInt(rawYear, 10) < 50 ? `20${rawYear}` : `19${rawYear}`)
    : rawYear;
  // If second segment > 12 it must be the day → US M/D/YY format
  // If first segment > 12 it must be the day → already DD/MM
  let day, month;
  if (p2 > 12) { day = p2; month = p1; }        // M/D/YY
  else if (p1 > 12) { day = p1; month = p2; }   // already DD/MM
  else { month = p1; day = p2; }                 // ambiguous: assume M/D (US)
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

// ─── Conversion helpers ────────────────────────────────────────────────────
function rowToObject(row, sheetRowNumber) {
  const obj = { _sheetRow: sheetRowNumber };
  COLUMNS.forEach((col, i) => {
    let val = row[i] !== undefined && row[i] !== null ? String(row[i]).trim() : '';
    if (col === 'tipoProducto') val = normalizeTipo(val);
    if (DATE_COLUMNS.has(col)) val = fixDateFormat(val);
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
 * Resolves the Excel file's Graph item ID and returns a workbook base URL of
 * the form /drives/{driveId}/items/{itemId}/workbook.
 *
 * This item-ID-based path bypasses some SharePoint tenant WAC routing
 * restrictions that affect the path-based URL (/drives/.../root:...:/workbook).
 * Falls back to getWorkbookBase() if the metadata fetch fails.
 */
async function resolveWorkbookBase(token) {
  try {
    let metaPath;
    if (FILE_ID) {
      metaPath = `/sites/${SITE_ID}/drive/items/${FILE_ID}`;
    } else if (DRIVE_ID) {
      metaPath = `/sites/${SITE_ID}/drives/${DRIVE_ID}/root:${encodePath(FILE_PATH)}`;
    } else {
      metaPath = `/sites/${SITE_ID}/drive/root:${encodePath(FILE_PATH)}`;
    }
    const resp = await axios.get(graphUrl(metaPath), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const itemId = resp.data.id;
    const driveId = (resp.data.parentReference || {}).driveId || DRIVE_ID;
    if (itemId && driveId) {
      console.log(`[resolveWorkbookBase] item-ID path: /drives/${driveId}/items/${itemId}/workbook`);
      return `/drives/${driveId}/items/${itemId}/workbook`;
    }
  } catch (e) {
    console.warn('[resolveWorkbookBase] could not resolve item ID, using path-based URL:', e.message);
  }
  return getWorkbookBase();
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
  // Use item-ID URL (/drives/{id}/items/{id}/workbook) — avoids some tenant WAC
  // routing issues that affect the path-based URL (/drives/.../root:...:/workbook)
  const workbookBase = await resolveWorkbookBase(token);
  const base = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const sheetBase = `${workbookBase}/worksheets('${encodeURIComponent(SHEET_NAME)}')`;

  // ── 1. Try persistent session ONCE; fall through on 423 or WAC 403 ────────
  // 423: file open in Excel Online → go sessionless immediately
  // 403: app lacks WAC session permission → still try sessionless reads/writes
  //      (direct range PATCH often works without a WAC session)
  let sessionId = null;
  try {
    const res = await axios.post(
      graphUrl(`${workbookBase}/createSession`),
      { persistChanges: true },
      { headers: base }
    );
    sessionId = res.data.id;
  } catch (err) {
    const status = err.response && err.response.status;
    if (status === 423 || status === 403) {
      console.warn('[appendRowViaWorkbookSession] createSession failed (%d) – proceeding sessionless', status);
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
    const lastCol = String.fromCharCode(64 + COLUMNS.length); // 'Q' for 17 cols
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
 * Binary fallback: download → add row with ExcelJS (preserves all cell
 * formatting) → re-upload.  Only reached when the Workbook/WAC API is
 * blocked by Azure permissions.
 *
 * @param {string[]} rowValues  Array of cell values (COLUMNS order)
 * @param {string}   nombreProducto  For duplicate detection
 */
async function addRowWithExceljs(rowValues, nombreProducto) {
  const buffer = await downloadExcel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws = wb.getWorksheet(SHEET_NAME);
  if (!ws) throw new Error(`Hoja "${SHEET_NAME}" no encontrada`);

  const npIdx = COLUMNS.indexOf('nombreProducto'); // 0-based
  const newNameNorm = (nombreProducto || '').trim().toLowerCase();
  let lastFilledRow = DATA_START_ROW - 1; // 1-based

  for (let r = DATA_START_ROW; r <= ws.actualRowCount + 10; r++) {
    const cell = ws.getCell(r, npIdx + 1); // ExcelJS is 1-based
    const val = cell.value != null ? String(cell.value).trim() : '';
    if (!val) continue;
    if (val.toLowerCase() === newNameNorm) {
      const dup = new Error(`La referencia "${nombreProducto}" ya está solicitada (fila ${r})`);
      dup.code = 'DUPLICATE';
      throw dup;
    }
    lastFilledRow = r;
  }

  const nextRow = lastFilledRow + 1;
  rowValues.forEach((val, colIdx) => {
    ws.getCell(nextRow, colIdx + 1).value = val || null;
  });

  const newBuffer = await wb.xlsx.writeBuffer();
  await uploadExcel(Buffer.from(newBuffer));
  return nextRow;
}

/**
 * POST a new referencia row to the Excel.
 *
 * Flow:
 * 1. Try Workbook API with persistent session.
 *    - 423: file open → skip session, try sessionless (MS auto-session coauthors)
 *    - 403 WAC: createSession blocked → skip session, try sessionless range PATCH
 *      (direct range PATCH often works without WAC session permission)
 * 2. If sessionless Workbook API also returns 403 → fall to ExcelJS binary.
 * 3. ExcelJS binary: download → add row (preserves all cell formatting) → PUT upload.
 *    - Only works when file is NOT open in Excel Online (PUT returns 423 if open).
 * 4. If binary PUT returns 423 → return a user-visible error asking them to
 *    either close the file OR have the admin add Sites.ReadWrite.All in Azure.
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

  // ── Primary: Workbook API ─────────────────────────────────────────────────
  try {
    const sheetRow = await appendRowViaWorkbookSession(rowValues, nombreProducto);
    return { sheetRow, ...dataWithDefaults };
  } catch (workbookErr) {
    if (workbookErr.code === 'DUPLICATE') throw workbookErr;
    const status = workbookErr.response && workbookErr.response.status;
    // Only fall back to binary when it's a permissions/WAC issue (403/401).
    // Any other error (sheet not found, network, etc.) is surfaced directly.
    if (status !== 403 && status !== 401) {
      const msg = workbookErr.response
        ? `${status} – ${JSON.stringify(workbookErr.response.data)}`
        : workbookErr.message;
      const e = new Error(`No se pudo guardar en el Excel: ${msg}`);
      e.status = status || 500;
      throw e;
    }
    console.warn('[addReferencia] Workbook API bloqueada (%d WAC) – usando descarga+ExcelJS', status);
  }

  // ── Fallback: binary download → ExcelJS → re-upload ──────────────────────
  // ExcelJS preserves all cell formatting (colours, borders, number formats).
  // This path only works when the file is NOT open in Excel Online.
  try {
    const sheetRow = await addRowWithExceljs(rowValues, nombreProducto);
    return { sheetRow, ...dataWithDefaults };
  } catch (binErr) {
    if (binErr.code === 'DUPLICATE') throw binErr;
    const status = binErr.status || (binErr.response && binErr.response.status);
    if (status === 423) {
      const e = new Error(
        'El archivo Excel está abierto en Excel Online. ' +
        'Cierra el archivo o pide al administrador que configure los permisos ' +
        'Sites.ReadWrite.All en Azure para permitir escritura simultánea.'
      );
      e.status = 423;
      throw e;
    }
    throw binErr;
  }
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

  // Step 0: token permissions (decode JWT roles)
  result.permissions = await getTokenPermissions();

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

  // Step 6: Workbook API probe (sessionless, item-ID URL) — tests WAC access
  try {
    const token = await getAccessToken();
    const workbookBase = await resolveWorkbookBase(token);
    result.steps.workbookBaseUrl = workbookBase;
    const resp = await axios.get(
      graphUrl(`${workbookBase}/worksheets`),
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const names = (resp.data.value || []).map((w) => w.name);
    result.steps.workbookApi = `OK – hojas: ${names.join(', ')}`;
  } catch (e) {
    const status = e.response && e.response.status;
    const msg = e.response && e.response.data && e.response.data.error
      ? `${status} ${e.response.data.error.code}: ${e.response.data.error.message}`
      : `${status || '?'} ${e.message}`;
    result.steps.workbookApi = `FAIL – ${msg}`;
    if (status === 403) {
      result.steps.workbookApiFix =
        'Añade el permiso "Sites.ReadWrite.All" (Application) en Azure AD → ' +
        'Azure Portal → App registrations → tu app → API permissions → ' +
        'Add a permission → Microsoft Graph → Application permissions → ' +
        'Sites.ReadWrite.All → Grant admin consent';
    }
  }

  return result;
}

module.exports = { getReferencias, addReferencia, diagnose, getTokenPermissions };
