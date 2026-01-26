import { Pool } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    const r = await pool.query('SELECT 1 AS ok');
    await pool.end();

    return res.status(200).json({
      ok: true,
      result: r.rows[0],
    });
  } catch (err) {
    console.error('[db-check]', err);
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
}
