import pkg from "pg";
const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set");
  throw new Error("❌ DATABASE_URL is not set");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                // 최대 동시 연결 수 (사장님 DB 플랜에 맞춰 조절)
  idleTimeoutMillis: 1000, // 일을 안 하는 연결은 1초 만에 즉시 해제 (자리를 빨리 비워줌)
  connectionTimeoutMillis: 2000, // 연결에 2초 이상 걸리면 실패 처리 (무한 대기 방지)
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
