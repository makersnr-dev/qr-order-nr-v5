// /api/orders.js
// Node.js 런타임에서 동작해야 /tmp 사용 가능
export const config = { runtime: 'nodejs' };

import fs from 'fs/promises';

const ORDERS_FILE = '/tmp/qrnr_orders.json';

async function loadOrders() {
  try {
    const txt = await fs.readFile(ORDERS_FILE, 'utf8');
    const parsed = JSON.parse(txt);

    if (parsed && Array.isArray(parsed.orders)) return parsed.orders;
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    console.error('[orders] loadOrders error:', err);
    return [];
  }
}

async function saveOrders(orders) {
  try {
    await fs.writeFile(
      ORDERS_FILE,
      JSON.stringify({ orders }, null, 2),
      'utf8'
    );
  } catch (err) {
    console.error('[orders] saveOrders error:', err);
    throw err;
  }
}

function makeTimeMeta() {
  const ts = Date.now();
  const KST_OFFSET = 9 * 60 * 60 * 1000;
  const kstDate = new Date(ts + KST_OFFSET);

  const y = kstDate.getUTCFullYear();
  const m = String(kstDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kstDate.getUTCDate()).padStart(2, '0');
  const hh = String(kstDate.getUTCHours()).padStart(2, '0');
  const mm = String(kstDate.getUTCMinutes()).padStart(2, '0');

  return {
    ts,
    date: `${y}-${m}-${d}`,
    dateTime: `${y}-${m}-${d} ${hh}:${mm}`,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return handleGet(req, res);
    if (req.method === 'POST') return handlePost(req, res);
    if (req.method === 'PUT') return handlePut(req, res);

    res.setHeader('Allow', 'GET,POST,PUT');
    return res.status(405).json({ ok: false });
  } catch (err) {
    console.error('[orders] handler error:', err);
    return res.status(500).json({ ok: false, error: 'INTERNAL' });
  }
}

async function handleGet(req, res) {
  const { type, storeId } = req.query || {};
  const all = await loadOrders();
  let list = [...all];

  if (type) list = list.filter(o => o.type === type);
  if (storeId) list = list.filter(o => o.storeId === storeId);

  list.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  return res.status(200).json({ ok: true, orders: list });
}

async function handlePost(req, res) {
  const body = req.body || {};
  let {
    orderId,
    type,
    amount,
    orderName,
    cart,
    customer,
    table,
    status,
    reserveDate,
    reserveTime,
    memo,
    meta,
    storeId,
    agreePrivacy,
  } = body;

  const amt = Number(amount);
  if (!type || Number.isNaN(amt)) {
    return res.status(400).json({ ok: false, error: 'INVALID_ORDER_PARAMS' });
  }

  const orders = await loadOrders();

  const id =
    body.id ||
    orderId ||
    `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const { ts, date, dateTime } = makeTimeMeta();

  let finalStoreId = storeId || null;

  if (!finalStoreId) {
    const ref = req.headers?.referer;
    if (ref) {
      try {
        const u = new URL(ref);
        const qs = u.searchParams.get('store');
        if (qs) finalStoreId = qs;
      } catch (_) {}
    }
  }

  if (!finalStoreId) finalStoreId = 'store1';

  const newOrder = {
    id,
    orderId: orderId || id,
    type,
    amount: amt,
    orderName,
    cart: cart || [],
    customer,
    table,
    status: status || 'paid',
    reserveDate: reserveDate || null,
    reserveTime: reserveTime || null,
    memo: memo || '',
    meta: meta || {},
    storeId: finalStoreId,
    ts,
    date,
    dateTime,
    agreePrivacy: !!agreePrivacy,
  };

  orders.push(newOrder);
  await saveOrders(orders);

  return res.status(200).json({ ok: true, order: newOrder });
}

async function handlePut(req, res) {
  const { id, orderId, status, meta } = req.body || {};

  if (!id && !orderId) {
    return res.status(400).json({ ok: false, error: 'MISSING_ID' });
  }

  const orders = await loadOrders();
  const idx = orders.findIndex(
    (o) => o.id === id || o.orderId === orderId
  );

  if (idx === -1) {
    return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND' });
  }

  const target = { ...orders[idx] };

  if (typeof status === 'string') target.status = status;
  if (meta && typeof meta === 'object') {
    target.meta = { ...(target.meta || {}), ...meta };
  }

  orders[idx] = target;
  await saveOrders(orders);

  return res.status(200).json({ ok: true, order: target });
}
