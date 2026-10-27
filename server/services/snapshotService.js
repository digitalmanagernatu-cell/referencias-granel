const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL no configurada');
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

async function initTable() {
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS referencias_snapshot (
      sheet_row   INTEGER PRIMARY KEY,
      data        JSONB    NOT NULL,
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// Returns a Map<sheetRow, dataObject>
async function getSnapshots() {
  const db = getPool();
  const { rows } = await db.query('SELECT sheet_row, data FROM referencias_snapshot');
  const map = new Map();
  rows.forEach(r => map.set(r.sheet_row, r.data));
  return map;
}

// Batch upsert: replace all snapshots for the given rows
async function upsertSnapshots(referencias) {
  if (!referencias.length) return;
  const db = getPool();
  // Build VALUES list
  const values = referencias.map((ref, i) =>
    `($${i * 2 + 1}, $${i * 2 + 2}::jsonb)`
  ).join(', ');
  const params = referencias.flatMap(ref => [ref._sheetRow, JSON.stringify(ref)]);
  await db.query(`
    INSERT INTO referencias_snapshot (sheet_row, data, updated_at)
    VALUES ${values}
    ON CONFLICT (sheet_row) DO UPDATE
      SET data = EXCLUDED.data, updated_at = NOW()
  `, params);
}

module.exports = { initTable, getSnapshots, upsertSnapshots };
