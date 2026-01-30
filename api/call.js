// /api/call.js
import { query } from './_lib/db.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  const { storeId, id, status } = req.query;

  try {
    // 1. 호출 기록 불러오기 (GET)
    if (req.method === 'GET') {
      const result = await query(`
        SELECT id, table_no as table, message, status, created_at as ts
        FROM call_logs WHERE store_id = $1 ORDER BY created_at DESC LIMIT 100
      `, [storeId]);
      return res.json({ ok: true, logs: result.rows });
    }

    // 2. 호출 기록 저장 (POST) - 손님이 버튼 누를 때
    if (req.method === 'POST') {
      const { storeId, table, note } = req.body;
      await query(`
        INSERT INTO call_logs (store_id, table_no, message, status)
        VALUES ($1, $2, $3, '대기')
      `, [storeId, table, note || '직원 호출']);
      return res.json({ ok: true });
    }

    // 3. 상태 변경 (PUT) - 사장님이 '완료' 처리할 때
    if (req.method === 'PUT') {
      const { id, status } = req.body;
      await query(`UPDATE call_logs SET status = $1 WHERE id = $2`, [status, id]);
      return res.json({ ok: true });
    }

  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'DB_ERROR' });
  }
}
