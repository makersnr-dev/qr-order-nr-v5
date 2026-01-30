// /api/payment-code.js
import { query, queryOne } from './_lib/db.js';

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const { storeId } = req.query; // URL에서 ?storeId=narae 처럼 받음

  if (!storeId) {
    return res.status(400).json({ ok: false, error: "MISSING_STORE_ID" });
  }

  // 1. 한국 시간 기준 오늘 날짜 생성 (YYYY-MM-DD)
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

  try {
    // GET 요청: 코드 조회 (없으면 생성)
    if (req.method === 'GET') {
      let data = await queryOne(
        'SELECT code FROM payment_codes WHERE store_id = $1 AND date = $2',
        [storeId, today]
      );

      if (!data) {
        // 오늘 코드가 없으면 새로 생성해서 저장
        const newCode = String(Math.floor(1000 + Math.random() * 9000));
        await query(
          'INSERT INTO payment_codes (store_id, date, code) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [storeId, today, newCode]
        );
        data = { code: newCode };
      }
      return res.json({ ok: true, code: data.code, date: today });
    }

    // POST 요청: 사장님이 "새 코드 발급" 버튼 눌렀을 때 (강제 갱신)
    if (req.method === 'POST') {
      const newCode = String(Math.floor(1000 + Math.random() * 9000));
      await query(`
        INSERT INTO payment_codes (store_id, date, code)
        VALUES ($1, $2, $3)
        ON CONFLICT (store_id, date) 
        DO UPDATE SET code = EXCLUDED.code
      `, [storeId, today, newCode]);

      return res.json({ ok: true, code: newCode, date: today });
    }

    return res.status(405).send("Method Not Allowed");
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "DB_ERROR" });
  }
}
