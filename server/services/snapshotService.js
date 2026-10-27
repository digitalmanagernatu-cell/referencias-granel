const { Client } = require('pg');

function makeClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL no configurada');
  }
  // El driver pg de Node.js no soporta channel_binding — lo eliminamos
  const url = process.env.DATABASE_URL
    .replace(/([?&])channel_binding=[^&]*/g, '$1')
    .replace(/[?&]$/, '');
  return new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
}

async function initTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS referencias_snapshot (
      sheet_row   INTEGER PRIMARY KEY,
      data        JSONB    NOT NULL,
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// Returns a Map<sheetRow, dataObject>
async function getSnapshots(client) {
  const { rows } = await client.query('SELECT sheet_row, data FROM referencias_snapshot');
  const map = new Map();
  rows.forEach(r => map.set(r.sheet_row, r.data));
  return map;
}

// Batch upsert
async function upsertSnapshots(client, referencias) {
  if (!referencias.length) return;
  const values = referencias.map((_, i) =>
    `($${i * 2 + 1}, $${i * 2 + 2}::jsonb)`
  ).join(', ');
  const params = referencias.flatMap(ref => [ref._sheetRow, JSON.stringify(ref)]);
  await client.query(`
    INSERT INTO referencias_snapshot (sheet_row, data)
    VALUES ${values}
    ON CONFLICT (sheet_row) DO UPDATE
      SET data = EXCLUDED.data, updated_at = NOW()
  `, params);
}

module.exports = { makeClient, initTable, getSnapshots, upsertSnapshots };
