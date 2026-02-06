import { query, transaction } from './db.js';

// 주문 생성
export async function insertOrder({
  storeId,
  orderNo,
  status,
  tableNo,
  amount,
  meta,
  items = [],
}) {
  return await transaction(async (client) => {
    // 주문 생성
    const orderRes = await client.query(
      `INSERT INTO orders
       (store_id, order_no, status, table_no, amount, meta)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [storeId, orderNo, status, tableNo || null, amount, meta || null]
    );

    const orderId = orderRes.rows[0].id;

    // 주문 항목 추가
    for (const it of items) {
      await client.query(
        `INSERT INTO order_items
         (order_id, name, qty, unit_price, options)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, it.name, it.qty, it.unit_price || it.price, it.options || null]
      );
    }

    return { ok: true, orderId };
  });
}

// 주문 목록 조회
export async function listOrders({ storeId, type, from, to }) {
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
      o.id,
      o.store_id,
      o.order_no,
      o.status,
      o.table_no,
      o.amount,
      o.meta,
      o.created_at,
      json_agg(
        json_build_object(
          'name', oi.name,
          'qty', oi.qty,
          'price', oi.unit_price,
          'options', oi.options
        )
      ) as items
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    GROUP BY o.id
    ORDER BY o.created_at DESC
    LIMIT 500
  `;

  const result = await query(sql, values);

  return {
    ok: true,
    orders: result.rows.map(row => ({
      id: String(row.id),
      orderId: row.order_no,
      type: row.meta?.type,
      amount: row.amount,
      cart: row.items || [],
      customer: row.meta?.customer || {},
      reserve: row.meta?.reserve || {},
      table: row.table_no,
      status: row.status,
      ts: new Date(row.created_at).getTime(),
      dateTime: row.created_at,
      storeId: row.store_id,
      meta: row.meta,
    })),
  };
}

// 주문 상태 + meta + history 업데이트
export async function updateOrder({
  storeId,
  orderNo,
  status,
  meta,
  history,
}) {
  const sets = [];
  const values = [];
  let idx = 1;

  if (status) {
    sets.push(`status = $${idx++}`);
    values.push(status);
  }

  if (meta) {
    sets.push(`meta = COALESCE(meta, '{}'::jsonb) || $${idx++}::jsonb`);
    values.push(meta);
  }

  if (history) {
    sets.push(`
      meta = jsonb_set(
        COALESCE(meta, '{}'::jsonb),
        '{history}',
        COALESCE(meta->'history', '[]'::jsonb) || $${idx++}::jsonb
      )
    `);
    values.push(
      Array.isArray(history) ? history : [history]
    );
  }

  if (!sets.length) {
    return { ok: true };
  }

  sets.push(`updated_at = NOW()`);

  values.push(orderNo);
  values.push(storeId);

  const sql = `
    UPDATE orders
    SET ${sets.join(', ')}
    WHERE order_no = $${idx++}
      AND store_id = $${idx}
  `;

  await query(sql, values);
  return { ok: true };
}
