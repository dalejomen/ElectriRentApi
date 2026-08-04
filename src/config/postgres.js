const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'yamabiko.proxy.rlwy.net',
  port: Number(process.env.DB_PORT || 22918),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'PRsGKDCblYjWIOvRVRvkdXwvDSjTeAJd',
  database: process.env.DB_NAME || 'railway',
  schema: process.env.DB_SCHEMA || 'public',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function testConnection() {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT NOW()');
    console.log('PostgreSQL connected successfully:', result.rows[0].now);
    return result.rows[0];
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  testConnection,
};
