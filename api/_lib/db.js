import pkg from "pg";
const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set");
  throw new Error("❌ DATABASE_URL is not set");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
    sslmode: 'verify-full',
  },
});

// ✅ 연결 테스트 추가
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result;
  } catch (e) {
    console.error('[DB Query Error]', e.message);
    throw e; // ✅ 에러를 상위로 전달
  } finally {
    client.release();
  }
}

export async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result;
  } finally {
    client.release();
  }
}

// Helper: 단일 행 반환
export async function queryOne(sql, params = []) {
  const result = await query(sql, params);
  return result.rows[0] || null;
}

// Helper: 트랜잭션 실행
export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
