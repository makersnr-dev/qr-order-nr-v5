// /api/orders.js
// 주문 조회 / 생성 / 상태 변경 API
// 현재는 /tmp/qrnr_orders.json 파일 기반 저장소 사용
// 나중에 DB로 바꾸려면 loadOrders / saveOrders만 수정하면 됨.


import fs from "fs/promises";

const ORDERS_FILE = "/tmp/qrnr_orders.json";

/* ============================================================
   스토리지 레이어
   ============================================================ */
async function loadOrders() {
  try {
    const txt = await fs.readFile(ORDERS_FILE, "utf8");
    const parsed = JSON.parse(txt);

    if (parsed && Array.isArray(parsed.orders)) {
      return parsed.orders;
    }

    // 혹시 예전에 [] 만 저장된 구조가 있으면 유지
    if (Array.isArray(parsed)) return parsed;

    return [];
  } catch (err) {
    if (err.code === "ENOENT") return []; // 파일 없으면 주문 0건
    console.error("[orders] loadOrders error:", err);
    return [];
  }
}

async function saveOrders(orders) {
  try {
    const data = { orders };
    await fs.writeFile(
      ORDERS_FILE,
      JSON.stringify(data, null, 2),
      "utf8"
    );
  } catch (err) {
    console.error("[orders] saveOrders error:", err);
    throw err;
  }
}

/* ============================================================
   시간 헬퍼 (KST)
   ============================================================ */
function makeTimeMeta() {
  const ts = Date.now();
  const KST_OFFSET = 9 * 60 * 60 * 1000;

  const kstDate = new Date(ts + KST_OFFSET);

  const y = kstDate.getUTCFullYear();
  const m = String(kstDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kstDate.getUTCDate()).padStart(2, "0");
  const hh = String(kstDate.getUTCHours()).padStart(2, "0");
  const mm = String(kstDate.getUTCMinutes()).padStart(2, "0");

  const date = `${y}-${m}-${d}`;
  const dateTime = `${date} ${hh}:${mm}`;

  return { ts, date, dateTime };
}

/* ============================================================
   메인 핸들러
   ============================================================ */
export default async function handler(req, res) {

  try {
    if (req.method === "GET") return handleGet(req, res);
    if (req.method === "POST") return handlePost(req, res);
    if (req.method === "PUT") return handlePut(req, res);

    res.setHeader("Allow", "GET,POST,PUT");
    return res.status(405).json({
      ok: false,
      error: "METHOD_NOT_ALLOWED",
    });
  } catch (err) {
    console.error("[orders] handler top-level error:", err);
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      detail: err?.message || String(err),
    });
  }
}

/* ============================================================
   GET /api/orders
   ============================================================ */
async function handleGet(req, res) {
  const { type, from, to, storeId } = req.query || {};

  const all = await loadOrders();
  let filtered = all.slice();

  if (type) filtered = filtered.filter((o) => o.type === type);
  if (storeId) filtered = filtered.filter((o) => o.storeId === storeId);

  let fromTs = from ? Date.parse(from) : null;
  let toTs = to ? Date.parse(to) : null;

  if (!Number.isNaN(fromTs) && fromTs != null) {
    filtered = filtered.filter((o) => {
      const ts = o.ts || Date.parse(o.dateTime || o.date);
      return ts >= fromTs;
    });
  }

  if (!Number.isNaN(toTs) && toTs != null) {
    filtered = filtered.filter((o) => {
      const ts = o.ts || Date.parse(o.dateTime || o.date);
      return ts <= toTs;
    });
  }

  filtered.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  return res.status(200).json({
    ok: true,
    orders: filtered,
  });
}

/* ============================================================
   POST /api/orders
   (toss-success.html에서 호출하는 주문 저장)
   ============================================================ */
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

  const amt = typeof amount === "number" ? amount : Number(amount);

  if (!type || Number.isNaN(amt)) {
    return res.status(400).json({
      ok: false,
      error: "INVALID_ORDER_PARAMS",
      detail: { type, amount },
    });
  }

  const orders = await loadOrders();

  const id =
    body.id ||
    orderId ||
    `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const { ts, date, dateTime } = makeTimeMeta();

  /* -----------------------------
     storeId 결정 규칙
     ----------------------------- */
  let finalStoreId = storeId;

  // 1) body.storeId 없음 → Referer ?store=에서 추출
  if (!finalStoreId) {
    const ref = req.headers?.referer || req.headers?.referrer;
    if (ref) {
      try {
        const u = new URL(ref);
        const qsStore = u.searchParams.get("store");
        if (qsStore) finalStoreId = qsStore;
      } catch {}
    }
  }

  // 2) 그래도 없으면 fallback
  if (!finalStoreId) finalStoreId = "store1";

  const newOrder = {
    id,
    orderId: orderId || id,
    type,
    amount: amt,
    orderName,
    cart: cart || [],
    customer: customer || null,
    table: table || null,
    status: status || "paid",
    reserveDate: reserveDate || null,
    reserveTime: reserveTime || null,
    memo: memo || "",
    meta: meta || {},
    ts,
    date,
    dateTime,
    storeId: finalStoreId,
    agreePrivacy: !!agreePrivacy,
  };

  orders.push(newOrder);
  await saveOrders(orders);

  return res.status(200).json({
    ok: true,
    order: newOrder,
  });
}

/* ============================================================
   PUT /api/orders
   주문 상태 변경
   ============================================================ */
async function handlePut(req, res) {
  const body = req.body || {};
  const { id, orderId, status, meta } = body;

  if (!id && !orderId) {
    return res.status(400).json({
      ok: false,
      error: "MISSING_ID",
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
      error: "ORDER_NOT_FOUND",
    });
  }

  const target = { ...orders[idx] };

  if (typeof status === "string") target.status = status;

  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    target.meta = { ...(target.meta || {}), ...meta };
  }

  orders[idx] = target;
  await saveOrders(orders);

  return res.status(200).json({
    ok: true,
    order: target,
  });
}
