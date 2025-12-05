// /api/orders.js
// 주문 조회 / 생성 / 상태 변경 API
// 현재는 /tmp/qrnr_orders.json 파일 기반 저장소 사용
// 나중에 DB로 바꾸려면 loadOrders / saveOrders만 수정하면 됨.

import fs from "fs/promises";
import { rateLimit } from "./_lib/rate-limit.js";

export const config = { runtime: "nodejs" };

// 주문 파일 저장 위치
const ORDERS_FILE = "/tmp/qrnr_orders.json";

/* ============================================================
   JSON RESPONSE HELPER
   ============================================================ */
function json(res, body, status = 200) {
  res.status(status).setHeader("content-type", "application/json");
  return res.send(JSON.stringify(body));
}

/* ============================================================
   스토리지 레이어
   ============================================================ */
async function loadOrders() {
  try {
    const txt = await fs.readFile(ORDERS_FILE, "utf8");
    const parsed = JSON.parse(txt);

    if (Array.isArray(parsed?.orders)) return parsed.orders;
    if (Array.isArray(parsed)) return parsed; // 혹시 예전 구조

    return [];
  } catch (err) {
    if (err.code === "ENOENT") return []; // 파일 없음 → 주문 0건
    console.error("[orders] loadOrders error:", err);
    return [];
  }
}

async function saveOrders(orders) {
  try {
    await fs.writeFile(
      ORDERS_FILE,
      JSON.stringify({ orders }, null, 2),
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
  const k = new Date(ts + KST_OFFSET);

  const y = k.getUTCFullYear();
  const m = String(k.getUTCMonth() + 1).padStart(2, "0");
  const d = String(k.getUTCDate()).padStart(2, "0");
  const hh = String(k.getUTCHours()).padStart(2, "0");
  const mm = String(k.getUTCMinutes()).padStart(2, "0");

  return {
    ts,
    date: `${y}-${m}-${d}`,
    dateTime: `${y}-${m}-${d} ${hh}:${mm}`,
  };
}

/* ============================================================
   메인 핸들러
   ============================================================ */
export default async function handler(req, res) {
  // ★ Rate Limit 추가 (관리자 페이지 폭주 방지)
  const limit = rateLimit(req, "orders");
  if (!limit.ok) {
    return json(res, { ok: false, error: limit.reason }, 429);
  }

  try {
    if (req.method === "GET") return handleGet(req, res);
    if (req.method === "POST") return handlePost(req, res);
    if (req.method === "PUT") return handlePut(req, res);

    res.setHeader("Allow", "GET,POST,PUT");
    return json(res, { ok: false, error: "METHOD_NOT_ALLOWED" }, 405);

  } catch (err) {
    console.error("[orders] handler top-level error:", err);
    return json(res, {
      ok: false,
      error: "INTERNAL_ERROR",
      detail: err?.message || String(err),
    }, 500);
  }
}

/* ============================================================
   GET /api/orders
   ============================================================ */
async function handleGet(req, res) {
  const { type, from, to, storeId } = req.query || {};

  const all = await loadOrders();
  let filtered = all.slice();

  if (type) filtered = filtered.filter(o => o.type === type);
  if (storeId) filtered = filtered.filter(o => o.storeId === storeId);

  let fromTs = from ? Date.parse(from) : null;
  let toTs = to ? Date.parse(to) : null;

  if (!Number.isNaN(fromTs) && fromTs != null) {
    filtered = filtered.filter(o => {
      const ts = o.ts || Date.parse(o.dateTime || o.date);
      return ts >= fromTs;
    });
  }

  if (!Number.isNaN(toTs) && toTs != null) {
    filtered = filtered.filter(o => {
      const ts = o.ts || Date.parse(o.dateTime || o.date);
      return ts <= toTs;
    });
  }

  filtered.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  return json(res, { ok: true, orders: filtered });
}

/* ============================================================
   POST /api/orders
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
    return json(res, {
      ok: false,
      error: "INVALID_ORDER_PARAMS",
      detail: { type, amount },
    }, 400);
  }

  const orders = await loadOrders();

  const id =
    body.id ||
    orderId ||
    `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const { ts, date, dateTime } = makeTimeMeta();

  let finalStoreId = storeId;

  if (!finalStoreId) {
    const ref = req.headers?.referer || req.headers?.referrer;
    if (ref) {
      try {
        const u = new URL(ref);
        const qs = u.searchParams.get("store");
        if (qs) finalStoreId = qs;
      } catch {}
    }
  }

  if (!finalStoreId) finalStoreId = "store1";

  /* ⭐ 요청사항 자동 통합 로직 (핵심) */
  let finalCustomer = customer || {};
  if (memo && !finalCustomer.req) {
    finalCustomer.req = memo;
  }

  const newOrder = {
    id,
    orderId: orderId || id,
    type,
    amount: amt,
    orderName,
    cart: cart || [],
    customer: finalCustomer,
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

  return json(res, { ok: true, order: newOrder });
}


/* ============================================================
   PUT /api/orders
   ============================================================ */
async function handlePut(req, res) {
  const { id, orderId, status, meta } = req.body || {};

  if (!id && !orderId) {
    return json(res, { ok: false, error: "MISSING_ID" }, 400);
  }

  const orders = await loadOrders();

  const idx = orders.findIndex(o => {
    if (id && o.id === id) return true;
    if (orderId && o.orderId === orderId) return true;
    return false;
  });

  if (idx === -1) {
    return json(res, { ok: false, error: "ORDER_NOT_FOUND" }, 404);
  }

  const target = { ...orders[idx] };

  if (typeof status === "string") target.status = status;

  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    target.meta = { ...(target.meta || {}), ...meta };
  }

  orders[idx] = target;
  await saveOrders(orders);

  return json(res, { ok: true, order: target });
}
