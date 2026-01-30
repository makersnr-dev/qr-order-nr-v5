// /api/call.js
import { query } from './_lib/db.js'; // ✅ DB 연결 도구 불러오기

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  // 1. POST 요청인지 확인
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false });
  }

  const { storeId, table, note } = req.body || {};

  // 2. 필수 데이터 확인
  if (!storeId || !table) {
    return res.status(400).json({ ok: false, error: 'MISSING_PARAMS' });
  }

  try {
    // 3. Neon DB의 call_logs 테이블에 기록 저장 (가장 중요!)
    // 이 한 줄이 기존의 복잡한 파일 체크를 대신합니다.
    await query(`
      INSERT INTO call_logs (store_id, table_no, message, status)
      VALUES ($1, $2, $3, '대기')
    `, [storeId, table, note || '직원 호출']);

    // 4. 성공 응답
    return res.json({ ok: true });

  } catch (e) {
    console.error('[DB CALL ERROR]', e.message);
    return res.status(500).json({ ok: false, error: 'DB_ERROR' });
  }
}
