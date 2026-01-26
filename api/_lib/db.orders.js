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

/* ============================================================
   PHASE 3-4
   주문 목록 DB 조회
   ============================================================ */
export async function listOrders({ storeId, type, from, to }) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const where = [];
    const values = [];
    let idx = 1;

    if (storeId) {
      where.push(`store_id = $${idx++}`);
      values.push(storeId);
    }

    if (type) {
      where.push(`(meta->>'type') = $${idx++}`);
      values.push(type);
    }

    if (from) {
      where.push(`created_at >= $${idx++}`);
      values.push(from);
    }

    if (to) {
      where.push(`created_at <= $${idx++}`);
      values.push(to);
    }

    const sql = `
      SELECT
        id,
        store_id,
        order_no,
        status,
        table_no,
        amount,
        meta,
        created_at
      FROM orders
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY created_at DESC
      LIMIT 500
    `;

    const r = await client.query(sql, values);

    return {
      ok: true,
      orders: r.rows.map(row => ({
        id: String(row.id),
        orderId: row.order_no,
        type: row.meta?.type,
        amount: row.amount,
        cart: row.meta?.items || [],
        customer: row.meta?.customer || {},
        reserve: row.meta?.reserve || {},
        table: row.table_no,
        status: row.status,
        ts: new Date(row.created_at).getTime(),
        dateTime: row.created_at,
        storeId: row.store_id,
      })),
    };
  } catch (e) {
    console.error('[DB listOrders]', e);
    return { ok: false, error: e.message };
  } finally {
    client.release();
  }
}
