import { getPool } from './db.js';

// DB에 주문 저장 (실패해도 기존 로직 영향 없게 설계)
export async function insertOrder({
  storeId,
  orderNo,
  status,
  tableNo,
  amount,
  meta,
  items = [],
}) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const orderRes = await client.query(
      `INSERT INTO orders
       (store_id, order_no, status, table_no, amount, meta)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id`,
      [storeId, orderNo, status, tableNo || null, amount, meta || null]
    );

    const orderId = orderRes.rows[0].id;

    for (const it of items) {
      await client.query(
        `INSERT INTO order_items
         (order_id, name, qty, unit_price, options)
         VALUES ($1,$2,$3,$4,$5)`,
        [orderId, it.name, it.qty, it.unit_price, it.options || null]
      );
    }

    await client.query('COMMIT');
    return { ok: true, orderId };
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[DB insertOrder]', e);
    return { ok: false, error: e.message };
  } finally {
    client.release();
  }
}
