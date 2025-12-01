// /api/orders.js
// 주문 조회 / 생성 / 상태 변경 (다점포 + Node 런타임 안정 버전)

export const config = {
  runtime: "nodejs18.x",
};

import fs from "fs/promises";

const ORDERS_FILE = "/tmp/qrnr_orders.json";

/* ============================================================
   스토리지 레이어 (나중에 DB로 교체할 구간)
============================================================ */

async function loadOrders() {
  try {
    const txt = await fs.readFile(ORDERS_FILE, "utf8");
    const parsed = JSON.parse(txt);

    if (parsed && Array.isArray(parsed.orders)) return parsed.orders;
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch (err) {
    if (err?.code === "ENOENT") return []; // 파일 없음 = 주문 0
    console.error("[orders] load error:", err);
    return [];
  }
}

async function saveOrders(arr) {
  try {
    const obj = { orders: Array.isArray(arr) ? arr : [] };
    await fs.writeFile(
      ORDERS_FILE,
      JSON.stringify(obj, null, 2),
      "utf8"
    );
  } catch (err) {
    console.error("[orders] save error:", err);
    throw err;
  }
}

/* ============================================================
   날짜/시간 헬퍼(KST)
============================================================ */

function makeKSTTimeMeta() {
  const ts = Date.now();

  const offset = 9 * 60 * 60 * 1000;
  const kst = new Date(ts + offset);

  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  const HH = String(kst.getUTCHours()).padStart(2, "0");
  const MM = String(kst.getUTCMinutes()).padStart(2, "0");

  return {
    ts,
    date: `${yyyy}-${mm}-${dd}`,
    dateTime: `${yyyy}-${mm}-${dd} ${HH}:${MM}`,
  };
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
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  } catch (err) {
    console.error("[orders] top-level err:", err);
    return res
      .status(500)
      .json({ ok: false, error: "INTERNAL_ERROR", detail: err?.message });
  }
}

/* ============================================================
   GET /api/orders
============================================================ */

async function handleGet(req, res) {
  const { type, from, to, storeId } = req.query || {};

  let orders = await loadOrders();
  orders = orders.slice(); // 카피

  if (type) orders = orders.filter((o) => o.type === type);
  if (storeId) orders = orders.filter((o) => o.storeId === storeId);

  // 날짜 필터링
  let fromTs = from ? Date.parse(from) : null;
  let toTs = to ? Date.parse(to) : null;

  if (!Number.isNaN(fromTs) && fromTs != null) {
    orders = orders.filter((o) => {
      const ts = o.ts || Date.parse(o.dateTime || 0);
      return !Number.isNaN(ts) && ts >= fromTs;
    });
  }

  if (!Number.isNaN(toTs) && toTs != null) {
    orders = orders.filter((o) => {
      const ts = o.ts || Date.parse(o.dateTime || 0);
      return !Number.isNaN(ts) && ts <= toTs;
    });
  }

  // 최신순 정렬
  orders.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  return res.status(200).json({ ok: true, orders });
}

/* ============================================================
   POST /api/orders  (주문 저장)
============================================================ */

async function handlePost(req, res) {
  const body = await req.json().catch(() => ({}));

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

  /* ----------------------------
     storeId 추출 강화
  ----------------------------- */
  let finalStoreId = storeId || null;

  // 1) 클라이언트에서 헤더로 전송했을 때
  if (!finalStoreId && req.headers["x-store-id"]) {
    finalStoreId = req.headers["x-store-id"];
  }

  // 2) referer에서 추출
  if (!finalStoreId) {
    const ref = req.headers?.referer || req.headers?.referrer;
    if (ref) {
      try {
        const u = new URL(ref);
        const s = u.searchParams.get("store");
        if (s) finalStoreId = s;
      } catch {}
    }
  }

  // 3) 기본값
  if (!finalStoreId) finalStoreId = "store1";

  /* ----------------------------
     orderId 자동 생성
  ----------------------------- */

  const internalId =
    body.id ||
    orderId ||
    `ord-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const finalOrderId = orderId || internalId;

  const { ts, date, dateTime } = makeKSTTimeMeta();

  const newOrder = {
    id: internalId,
    orderId: finalOrderId,
    type,
    amount: amt,
    orderName: orderName || "",
    cart: Array.isArray(cart) ? cart : [],
    customer: customer || null,
    table: table || null,
    status: status || "paid",
    reserveDate: reserveDate || null,
    reserveTime: reserveTime || null,
    memo: memo || "",
    meta: meta || {},
    storeId: finalStoreId,
    ts,
    date,
    dateTime,
    agreePrivacy: !!agreePrivacy,
  };

  const list = await loadOrders();
  list.push(newOrder);
  await saveOrders(list);

  return res.status(200).json({ ok: true, order: newOrder });
}

/* ============================================================
   PUT /api/orders  (상태 변경)
============================================================ */

async function handlePut(req, res) {
  const body = await req.json().catch(() => ({}));
  const { id, orderId, status, meta } = body;

  if (!id && !orderId) {
    return res.status(400).json({
      ok: false,
      error: "MISSING_ID",
    });
  }

  const list = await loadOrders();

  const idx = list.findIndex((o) => {
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

  const target = { ...list[idx] };

  if (typeof status === "string") {
    target.status = status;
  }

  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    target.meta = {
      ...(target.meta || {}),
      ...meta,
    };
  }

  list[idx] = target;
  await saveOrders(list);

  return res.status(200).json({ ok: true, order: target });
}
