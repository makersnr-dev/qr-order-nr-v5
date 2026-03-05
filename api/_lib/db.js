import pkg from "pg";
const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://dummy:dummy@dummy:5432/dummy",
  max: 15,                     // Vercel 환경에 맞게 적정 수준 유지
  idleTimeoutMillis: 30000,    // 🚀 연결 유지 시간 1초 -> 30초로 증가 (매번 재연결하는 부하 방지)
  connectionTimeoutMillis: 10000, // 🚀 접속 대기 시간 2초 -> 10초로 증가 (DB가 깨어날 충분한 시간 확보)
  ssl: true
});

// ✅ 연결 테스트 추가
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export async function query(sql, params = []) {
  try {
    // client를 직접 꺼내지 않고 pool.query를 쓰면 코드가 훨씬 견고해집니다.
    return await pool.query(sql, params);
  } catch (e) {
    console.error('[DB Query Error]', e.message);
    throw e;
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
