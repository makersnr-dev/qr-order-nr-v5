// api/orders.js
// 주문 조회 / 생성 / 상태 변경
// 지금은 /tmp/qrnr_orders.json 파일을 사용하지만,
// 나중에 DB로 바꿀 때는 아래 loadOrders / saveOrders 쪽만 수정하면 됨.

import fs from 'fs/promises';

const ORDERS_FILE = '/tmp/qrnr_orders.json';

/**
 * ===== 스토리지 레이어 =====
 * 나중에 DB로 교체할 부분은 이 두 함수(loadOrders, saveOrders)만 손보면 됨.
 */

async function loadOrders() {
  try {
    const txt = await fs.readFile(ORDERS_FILE, 'utf8');
    const parsed = JSON.parse(txt);

    // { orders: [...] } 형태를 기본으로 사용
    if (parsed && Array.isArray(parsed.orders)) {
      return parsed.orders;
    }

    // 혹시 예전에 [ ... ] 만 저장된 적이 있다면 대비
    if (Array.isArray(parsed)) {
      return parsed;
    }

    return [];
  } catch (err) {
    // 파일이 아직 없으면(ENOENT) = 주문 0건
    if (err && err.code === 'ENOENT') {
      return [];
    }
    console.error('[orders] loadOrders error:', err);
    return [];
  }
}

async function saveOrders(orders) {
  try {
    const data = {
      // 나중에 메타데이터를 추가하고 싶으면 여기 확장
      orders,
    };
    await fs.writeFile(ORDERS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[orders] saveOrders error:', err);
    throw err;
  }
}

/**
 * 날짜/시간 헬퍼
 */
function makeTimeMeta(dateObj = new Date()) {
  const ts = dateObj.getTime();
  const iso = dateObj.toISOString(); // YYYY-MM-DDTHH:mm:ss.sssZ
  const date = iso.slice(0, 10); // YYYY-MM-DD

  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  const hh = String(dateObj.getHours()).padStart(2, '0');
  const mm = String(dateObj.getMinutes()).padStart(2, '0');

  const dateTime = `${y}-${m}-${d} ${hh}:${mm}`;

  return { ts, date, dateTime };
}

/**
 * 메인 핸들러
 */
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return handleGet(req, res);
    }
    if (req.method === 'POST') {
      return handlePost(req, res);
    }
    if (req.method === 'PUT') {
      return handlePut(req, res);
    }

    res.setHeader('Allow', 'GET,POST,PUT');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  } catch (err) {
    console.error('[orders] handler top-level error:', err);
    return res.status(500).json({
      ok: false,
      error: 'INTERNAL_ERROR',
      detail: err?.message || String(err),
    });
  }
}

/**
 * GET /api/orders
 * 쿼리:
 *  - type: 'store' | 'delivery' | 'reserve' (선택)
 *  - from: ISO 날짜 문자열 (선택)
 *  - to:   ISO 날짜 문자열 (선택)
 *  - storeId: 매장 ID (선택)
 */
async function handleGet(req, res) {
  const { type, from, to, storeId } = (req.query || {});

  const allOrders = await loadOrders();

  let filtered = allOrders.slice();

  if (type) {
    filtered = filtered.filter((o) => o.type === type);
  }

  if (storeId) {
    filtered = filtered.filter((o) => o.storeId === storeId);
  }

  let fromTs = null;
  let toTs = null;

  if (from) {
    const t = Date.parse(from);
    if (!Number.isNaN(t)) fromTs = t;
  }

  if (to) {
    const t = Date.parse(to);
    if (!Number.isNaN(t)) toTs = t;
  }

  if (fromTs != null) {
    filtered = filtered.filter((o) => {
      const ts = o.ts || Date.parse(o.dateTime || o.date || 0);
      return !Number.isNaN(ts) && ts >= fromTs;
    });
  }

  if (toTs != null) {
    filtered = filtered.filter((o) => {
      const ts = o.ts || Date.parse(o.dateTime || o.date || 0);
      return !Number.isNaN(ts) && ts <= toTs;
    });
  }

  // 최신 주문이 위로 오도록 ts 기준 내림차순
  filtered.sort((a, b) => {
    const ats = a.ts || 0;
    const bts = b.ts || 0;
    return bts - ats;
  });

  return res.status(200).json({
    ok: true,
    orders: filtered,
  });
}

/**
 * POST /api/orders
 * body 예시:
 * {
 *   orderId,
 *   type,          // 'store' | 'delivery' | 'reserve'
 *   amount,
 *   orderName,
 *   cart,
 *   customer,
 *   table,
 *   status,        // 기본값 'paid' 등
 *   reserveDate,
 *   reserveTime,
 *   memo,
 *   meta,
 *   storeId
 * }
 *
 * toss-success.html 에서 호출하는 구조를 그대로 유지
 */
async function handlePost(req, res) {
  const body = req.body || {};

  const {
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
  } = body;

  // 최소 필드 검증 (필요 시 더 추가 가능)
  if (!orderId || !type || typeof amount !== 'number') {
    return res.status(400).json({
      ok: false,
      error: 'INVALID_ORDER_PARAMS',
      detail: { orderId, type, amount },
    });
  }

  const orders = await loadOrders();

  // 내부적으로 사용할 고유 id
  // (기존 body.Id가 있으면 우선 사용 → admin 쪽과 호환)
  const id =
    body.id ||
    orderId ||
    `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const { ts, date, dateTime } = makeTimeMeta(new Date());

  const newOrder = {
    id,
    orderId,
    type,
    amount,
    orderName,
    cart: cart || [],
    customer: customer || null,
    table: table || null,
    status: status || 'paid', // 결제 성공 화면에서 저장하므로 기본값 'paid'
    reserveDate: reserveDate || null,
    reserveTime: reserveTime || null,
    memo: memo || '',
    meta: meta || {},
    storeId: storeId || 'store1',
    ts,
    date,
    dateTime,
  };

  orders.push(newOrder);
  await saveOrders(orders);

  return res.status(200).json({
    ok: true,
    order: newOrder,
  });
}

/**
 * PUT /api/orders
 * body 예시:
 * {
 *   id,                   // 필수 (or orderId)
 *   status,               // 선택
 *   meta: { ...patch... } // 선택
 * }
 */
async function handlePut(req, res) {
  const body = req.body || {};
  const { id, orderId, status, meta } = body;

  if (!id && !orderId) {
    return res.status(400).json({
      ok: false,
      error: 'MISSING_ID',
    });
  }

  const orders = await loadOrders();

  const idx = orders.findIndex((o) => {
    if (id && o.id === id) return true;
    if (orderId && o.orderId === orderId) return true;
    return false;
  });

  if (idx === -1) {
    return res.status(404).json({
      ok: false,
      error: 'ORDER_NOT_FOUND',
    });
  }

  const target = { ...orders[idx] };

  if (typeof status === 'string') {
    target.status = status;
  }

  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    target.meta = {
      ...(target.meta || {}),
      ...meta,
    };
  }

  // 변경된 내용 반영
  orders[idx] = target;
  await saveOrders(orders);

  return res.status(200).json({
    ok: true,
    order: target,
  });
}
