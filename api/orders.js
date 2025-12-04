// /api/orders.js
export const config = {
  runtime: "nodejs" // fs/promises 때문에 Node 런타임 고정
};

import { rateLimit } from "../_lib/rate-limit.js";
import fs from "fs/promises";

const ORDERS_FILE = "/tmp/qrnr_orders.json";

/* -------------------------------
   rate limit wrapper
--------------------------------- */
function checkRate(req) {
  const limit = rateLimit(req, "orders");
  if (!limit.ok) {
    return new Response(
      JSON.stringify({ ok: false, error: limit.reason }),
      {
        status: 429,
        headers: { "content-type": "application/json" }
      }
    );
  }
  return null;
}

/* -------------------------------
   storage layer
--------------------------------- */
async function loadOrders() {
  try {
    const txt = await fs.readFile(ORDERS_FILE, "utf8");
    const parsed = JSON.parse(txt);

    if (parsed && Array.isArray(parsed.orders)) return parsed.orders;
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

/* -------------------------------
   KST time helper
--------------------------------- */
function makeTimeMeta() {
  const ts = Date.now();
  const KST = new Date(ts + 9 * 3600 * 1000);

  const y = KST.getUTCFullYear();
  const m = String(KST.getUTCMonth() + 1).padStart(2, "0");
  const d = String(KST.getUTCDate()).padStart(2, "0");
  const hh = String(KST.getUTCHours()).padStart(2, "0");
  const mm = String(KST.getUTCMinutes()).padStart(2, "0");

  return {
    ts,
    date: `${y}-${m}-${d}`,
    dateTime: `${y}-${m}-${d} ${hh}:${mm}`
  };
}

/* -------------------------------
   main handler
--------------------------------- */
export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const limitResponse = checkRate(req);
      if (limitResponse) return limitResponse;
      return handleGet(req, res);
    }

    if (req.method === "POST") {
      // 고객 주문 저장 → Rate Limit 적용 금지
      return handlePost(req, res);
    }

    if (req.method === "PUT") {
      const limitResponse = checkRate(req);
      if (limitResponse) return limitResponse;
      return handlePut(req, res);
    }

    res.setHeader("Allow", "GET,POST,PUT");
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });

  } catch (err) {
    console.error("[orders] error:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}

/* -------------------------------
   GET
--------------------------------- */
async function handleGet(req, res) {
  const { type, from, to, storeId } = req.query || {};

  const all = await loadOrders();
  let filtered = all;

  if (type) filtered = filtered.filter(o => o.type === type);
  if (storeId) filtered = filtered.filter(o => o.storeId === storeId);

  const fromTs = from ? Date.parse(from) : null;
  const toTs = to ? Date.parse(to) : null;

  if (fromTs != null && !Number.isNaN(fromTs)) {
    filtered = filtered.filter(o => (o.ts || 0) >= fromTs);
  }
  if (toTs != null && !Number.isNaN(toTs)) {
    filtered = filtered.filter(o => (o.ts || 0) <= toTs);
  }

  filtered.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  return res.status(200).json({ ok: true, orders: filtered });
}

/* -------------------------------
   POST
--------------------------------- */
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
    agreePrivacy
  } = body;

  const amt = Number(amount);

  if (!type || Number.isNaN(amt)) {
    return res.status(400).json({
      ok: false,
      error: "INVALID_ORDER_PARAMS"
    });
  }

  const orders = await loadOrders();
  const id = orderId || `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { ts, date, dateTime } = makeTimeMeta();

  let finalStoreId = storeId;

  // body.storeId 없으면 Referer에서 가져오기
  if (!finalStoreId) {
    const ref = req.headers?.referer || req.headers?.referrer;
    if (ref) {
      try {
        const u = new URL(ref);
        finalStoreId = u.searchParams.get("store") || "store1";
      } catch {
        finalStoreId = "store1";
      }
    }
  }

  if (!finalStoreId) finalStoreId = "store1";

  const newOrder = {
    id,
    orderId: id,
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
    agreePrivacy: !!agreePrivacy
  };

  orders.push(newOrder);
  await saveOrders(orders);

  return res.status(200).json({ ok: true, order: newOrder });
}

/* -------------------------------
   PUT
--------------------------------- */
async function handlePut(req, res) {
  const body = req.body || {};
  const { id, orderId, status, meta } = body;

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
    target.meta = { ...target.meta, ...meta };
  }

  orders[idx] = target;
  await saveOrders(orders);

  return res.status(200).json({ ok: true, order: target });
}
