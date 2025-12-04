// /api/orders.js
export const config = {
  runtime: "nodejs" // fs 사용 → 반드시 Node 런타임
};

import { rateLimit } from "../_lib/rate-limit.js";
import fs from "fs/promises";

const ORDERS_FILE = "/tmp/qrnr_orders.json";

/* ============================================================
   STORAGE LAYER
============================================================ */
async function loadOrders() {
  try {
    const txt = await fs.readFile(ORDERS_FILE, "utf8");
    const parsed = JSON.parse(txt);

    if (Array.isArray(parsed.orders)) return parsed.orders;
    if (Array.isArray(parsed)) return parsed;

    return [];
  } catch (err) {
    if (err.code === "ENOENT") return [];
    console.error("[orders] loadOrders error:", err);
    return [];
  }
}

async function saveOrders(orders) {
  await fs.writeFile(
    ORDERS_FILE,
    JSON.stringify({ orders }, null, 2),
    "utf8"
  );
}

/* ============================================================
   TIME META (KST)
============================================================ */
function makeTimeMeta() {
  const ts = Date.now();
  const kst = new Date(ts + 9 * 3600 * 1000);

  const Y = kst.getUTCFullYear();
  const M = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const D = String(kst.getUTCDate()).padStart(2, "0");
  const h = String(kst.getUTCHours()).padStart(2, "0");
  const m = String(kst.getUTCMinutes()).padStart(2, "0");

  return {
    ts,
    date: `${Y}-${M}-${D}`,
    dateTime: `${Y}-${M}-${D} ${h}:${m}`
  };
}

/* ============================================================
   MAIN HANDLER
============================================================ */
export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      // GET만 rate-limit 적용
      const limit = rateLimit(req, "orders-get");
      if (!limit.ok) {
        return res
          .status(429)
          .json({ ok: false, error: limit.reason });
      }
      return handleGet(req, res);
    }

    if (req.method === "POST") {
      // POST = 고객 주문 저장 → rate-limit 적용 금지
      return handlePost(req, res);
    }

    if (req.method === "PUT") {
      const limit = rateLimit(req, "orders-put");
      if (!limit.ok) {
        return res
          .status(429)
          .json({ ok: false, error: limit.reason });
      }
      return handlePut(req, res);
    }

    res.setHeader("Allow", "GET,POST,PUT");
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });

  } catch (err) {
    console.error("[orders] handler error:", err);
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      detail: err?.message || String(err)
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

  if (type) filtered = filtered.filter(o => o.type === type);
  if (storeId) filtered = filtered.filter(o => o.storeId === storeId);

  const fromTs = from ? Date.parse(from) : null;
  const toTs = to ? Date.parse(to) : null;

  if (fromTs && !Number.isNaN(fromTs))
    filtered = filtered.filter(o => (o.ts || 0) >= fromTs);

  if (toTs && !Number.isNaN(toTs))
    filtered = filtered.filter(o => (o.ts || 0) <= toTs);

  filtered.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  return res.status(200).json({
    ok: true,
    orders: filtered
  });
}

/* ============================================================
   POST /api/orders  (결제 완료 → 주문 저장)
============================================================ */
async function handlePost(req, res) {
  const body = req.body || {};

  const amt = Number(body.amount);
  if (!body.type || Number.isNaN(amt)) {
    return res.status(400).json({
      ok: false,
      error: "INVALID_ORDER_PARAMS"
    });
  }

  const orders = await loadOrders();
  const { ts, date, dateTime } = makeTimeMeta();

  let storeId = body.storeId;

  if (!storeId) {
    const ref = req.headers?.referer || req.headers?.referrer;
    if (ref) {
      try {
        const u = new URL(ref);
        storeId = u.searchParams.get("store");
      } catch {}
    }
  }

  if (!storeId) storeId = "store1";

  const id =
    body.orderId ||
    `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const newOrder = {
    id,
    orderId: id,
    type: body.type,
    amount: amt,
    orderName: body.orderName,
    cart: body.cart || [],
    customer: body.customer || null,
    table: body.table || null,
    status: body.status || "paid",
    reserveDate: body.reserveDate || null,
    reserveTime: body.reserveTime || null,
    memo: body.memo || "",
    meta: body.meta || {},
    storeId,
    ts,
    date,
    dateTime,
    agreePrivacy: !!body.agreePrivacy
  };

  orders.push(newOrder);
  await saveOrders(orders);

  return res.status(200).json({ ok: true, order: newOrder });
}

/* ============================================================
   PUT /api/orders  (주문 상태 변경)
============================================================ */
async function handlePut(req, res) {
  const { id, orderId, status, meta } = req.body || {};

  if (!id && !orderId) {
    return res.status(400).json({ ok: false, error: "MISSING_ID" });
  }

  const orders = await loadOrders();
  const idx = orders.findIndex(
    o => o.id === id || o.orderId === orderId
  );

  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "ORDER_NOT_FOUND" });
  }

  const target = { ...orders[idx] };

  if (typeof status === "string") target.status = status;
  if (meta && typeof meta === "object") {
    target.meta = { ...(target.meta || {}), ...meta };
  }

  orders[idx] = target;
  await saveOrders(orders);

  return res.status(200).json({ ok: true, order: target });
}
