// api/orders.js
// 주문 조회 / 생성 / 상태 변경
// 지금은 /tmp/qrnr_orders.json 파일을 사용하지만,
// 나중에 DB로 바꿀 때는 아래 loadOrders / saveOrders 쪽만 수정하면 됨.
//import { rateLimit } from "../_lib/rate-limit.js";
import fs from 'fs/promises';

const ORDERS_FILE = '/tmp/qrnr_orders.json';
/*const limit = rateLimit(req, "orders");
if (!limit.ok) {
  return new Response(JSON.stringify({ ok: false, error: limit.reason }), {
    status: 429,
    headers: { "content-type": "application/json" }
  });
}*/

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
// KST(UTC+9) 기준으로 날짜/시간을 만들어주는 함수
function makeTimeMeta() {
  // ts는 항상 UTC 기준 타임스탬프(밀리초)
  const ts = Date.now();

  // KST = UTC + 9시간
  const KST_OFFSET = 9 * 60 * 60 * 1000;
  const kstDate = new Date(ts + KST_OFFSET);

  const y  = kstDate.getUTCFullYear();
  const m  = String(kstDate.getUTCMonth() + 1).padStart(2, '0');
  const d  = String(kstDate.getUTCDate()).padStart(2, '0');
  const hh = String(kstDate.getUTCHours()).padStart(2, '0');
  const mm = String(kstDate.getUTCMinutes()).padStart(2, '0');

  const date = `${y}-${m}-${d}`;                 // 예: 2025-11-14
  const dateTime = `${y}-${m}-${d} ${hh}:${mm}`; // 예: 2025-11-14 10:10

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
 *   storeId,
 *   agreePrivacy   // ✅ 개인정보 동의 여부 (true/false)
 * }
 *
 * toss-success.html 에서 호출하는 구조를 그대로 유지
 */
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

  // amount가 문자열로 올 수 있으니 숫자로 한 번 변환
  const amt =
    typeof amount === 'number' ? amount : Number(amount);

  // 최소 필드 검증:
  //  - type은 필수
  //  - amount는 숫자여야 함
  //  - orderId는 없어도 됨 (서버에서 자동 생성)
  if (!type || Number.isNaN(amt)) {
    return res.status(400).json({
      ok: false,
      error: 'INVALID_ORDER_PARAMS',
      detail: { orderId: orderId || null, type, amount },
    });
  }

  const orders = await loadOrders();

  // 내부적으로 사용할 고유 id
  // (기존 body.id가 있으면 우선 사용 → admin 쪽과 호환)
  const id =
    body.id ||
    orderId ||
    `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const { ts, date, dateTime } = makeTimeMeta();

  // 🔹 최종 storeId 결정
  let finalStoreId = storeId || null;

  // 1) body.storeId가 없다면, Referer 의 ?store= 에서 추출 시도
  if (!finalStoreId) {
    const ref = req.headers?.referer || req.headers?.referrer;
    if (ref) {
      try {
        const u = new URL(ref);
        const qsStore = u.searchParams.get('store');
        if (qsStore) {
          finalStoreId = qsStore;
        }
      } catch (e) {
        console.error('[orders] parse referer error', e);
      }
    }
  }

  // 2) 그래도 없으면 기본값
  if (!finalStoreId) {
    finalStoreId = 'store1';
  }

  // 최종 orderId (없으면 id와 동일하게 자동 설정)
  const finalOrderId = orderId || id;

  const newOrder = {
    id,
    orderId: finalOrderId,
    type,
    amount: amt,
    orderName,
    cart: cart || [],
    customer: customer || null,
    table: table || null,
    status: status || 'paid', // 결제 성공 화면에서 저장하므로 기본값 'paid'
    reserveDate: reserveDate || null,
    reserveTime: reserveTime || null,
    memo: memo || '',
    meta: meta || {},
    storeId: finalStoreId,
    ts,
    date,
    dateTime,
    // ✅ 개인정보 동의 여부 저장 (기본 false)
    agreePrivacy: !!agreePrivacy,
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
