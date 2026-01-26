// PHASE 2-7
// 주문을 DB에 "기록만" 하는 단계 (화면 동작에는 영향 없음)

import { getPool } from './db.js';

export async function insertOrder({
  storeId,
  orderNo,
  status,
  tableNo,
  amount,
  meta,
  items,
}) {
  // 1️⃣ DB 연결 준비
  const pool = getPool();
  const client = await pool.connect();

  // 2️⃣ items가 없을 때를 대비한 안전장치
  const safeItems = Array.isArray(items) ? items : [];

  try {
    // 3️⃣ DB 작업 시작
    await client.query('BEGIN');

    // 4️⃣ orders 테이블에 주문 1개 저장
    const orderRes = await client.query(
      `INSERT INTO orders
       (store_id, order_no, status, table_no, amount, meta)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id`,
      [storeId, orderNo, status, tableNo || null, amount, meta || null]
    );

    // 5️⃣ 방금 저장한 주문의 번호(id)
    const orderId = orderRes.rows[0].id;

    // 6️⃣ 주문 안의 메뉴들 저장
    for (const it of safeItems) {
      await client.query(
        `INSERT INTO order_items
         (order_id, name, qty, unit_price, options)
         VALUES ($1,$2,$3,$4,$5)`,
        [orderId, it.name, it.qty, it.unit_price, it.options || null]
      );
    }

    // 7️⃣ 모든 저장이 끝났으면 확정
    await client.query('COMMIT');

    return { ok: true, orderId };
  } catch (e) {
    // 8️⃣ 중간에 에러 나면 전부 취소
    await client.query('ROLLBACK');
    console.error('[insertOrder]', e);
    return { ok: false, error: e.message };
  } finally {
    // 9️⃣ DB 연결 닫기
    client.release();
  }
}
