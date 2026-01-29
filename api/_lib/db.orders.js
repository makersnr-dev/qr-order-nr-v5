import { getPool } from './db.js';

/* ============================================================
   주문 생성 (기존 유지)
   ============================================================ */
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
   ✅ PHASE 3-3
   주문 상태 변경 (관리자 PUT 대응)
   ============================================================ */
export async function updateOrderStatus({
  storeId,
  orderId,
  status,
  meta,
}) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const values = [];
    let idx = 1;
    const sets = [];

    if (status) {
      sets.push(`status = $${idx++}`);
      values.push(status);
    }

    if (meta) {
      sets.push(`meta = meta || $${idx++}::jsonb`);
      values.push(meta);
    }

    if (!sets.length) {
      return { ok: true };
    }

    values.push(orderId);
    values.push(storeId);

    const sql = `
      UPDATE orders
      SET ${sets.join(', ')}
      WHERE order_no = $${idx++}
        AND store_id = $${idx}
    `;

    await client.query(sql, values);
    return { ok: true };
  } catch (e) {
    console.error('[DB updateOrderStatus]', e);
    return { ok: false, error: e.message };
  } finally {
    client.release();
  }
}

/* ============================================================
   주문 목록 조회 (기존 유지)
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
