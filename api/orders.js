// /api/orders.js

import * as OrdersDB from './_lib/db.orders.js';
import { getAuthFromReq } from '../src/shared/auth.js';
import { rateLimit } from "./_lib/rate-limit.js";
import {
  STATUS_FLOW,
  INITIAL_STATUS,
  ORDER_STATUS
} from '../src/shared/constants/status.js';
import { verifyJWT } from "../src/shared/jwt.js";

async function getAdminStoreIdFromReq(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;

  const token = auth.slice(7);
  try {
    const payload = await verifyJWT(
      token,
      process.env.JWT_SECRET || "dev-secret"
    );
    return payload?.storeId || null;
  } catch (e) {
    console.error('[getAdminStoreIdFromReq] JWT verify error:', e);
    return null;
  }
}

export const config = { runtime: "nodejs" };

function json(res, body, status = 200) {
  res.status(status).setHeader("content-type", "application/json");
  return res.send(JSON.stringify(body));
}

async function assertValidStoreId(storeId) {
  if (!storeId) {
    const err = new Error('MISSING_STORE_ID');
    err.status = 400;
    throw err;
  }

  if (typeof storeId !== 'string' || storeId.length < 1) {
    const err = new Error('INVALID_STORE_ID');
    err.status = 400;
    throw err;
  }

  return true;
}

// ✅ 추가: loadStores 함수 (handlePost에서 사용 중)
async function loadStores() {
  // 임시: 빈 객체 반환 (DB 연동 후 수정 예정)
  return {};
}

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

export default async function handler(req, res) {
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

// ✅ 수정: return 문 추가
async function handleGet(req, res) {
  const { type, from, to, storeId } = req.query || {};

  let adminStoreId = null;
  try {
    adminStoreId = await getAdminStoreIdFromReq(req);
  } catch (e) {
    console.error('[handleGet] JWT verification failed:', e);
  }

  if (adminStoreId && storeId && adminStoreId !== storeId) {
    return json(res, {
      ok: false,
      error: "STORE_MISMATCH",
      message: "다른 매장의 주문은 조회할 수 없습니다."
    }, 403);
  }

  if (adminStoreId) {
    try {
      const r = await OrdersDB.listOrders({
        storeId: adminStoreId,
        type,
        from,
        to,
      });

      if (!r.ok) {
        console.error('[handleGet] DB query failed:', r.error);
        return json(res, {
          ok: false,
          error: "DB_SELECT_FAILED",
          detail: r.error,
        }, 500);
      }

      return json(res, {
        ok: true,
        orders: r.orders,
        source: "db",
      });
    } catch (e) {
      console.error("[DB SELECT EXCEPTION]", e);
      return json(res, {
        ok: false,
        error: "DB_SELECT_EXCEPTION",
        detail: e.message,
      }, 500);
    }
  }

  // ✅ 추가: adminStoreId 없을 때 빈 배열 반환
  return json(res, {
    ok: true,
    orders: [],
    source: "fallback",
  });
}

function normalizeOrderInput(body) {
  const {
    customer = {},
    reserve = {},
    reserveDate,
    reserveTime,
    memo,
    meta = {},
  } = body;

  const finalCustomer = {
    name: customer.name || "",
    phone: customer.phone || "",
    addr: customer.addr || "",
    memo: customer.memo || customer.req || memo || meta.req || "",
  };

  const finalReserve = {
    date: reserve.date || reserveDate || meta.reserveDate || "",
    time: reserve.time || reserveTime || meta.reserveTime || "",
  };

  return { finalCustomer, finalReserve };
}

async function handlePost(req, res) {
  const body = req.body || {};

  const auth = await getAuthFromReq(req);

  if (auth?.storeId && !body.storeId) {
    body.storeId = auth.storeId;
  }
  
  const { finalCustomer, finalReserve } = normalizeOrderInput(body);

  let {
    orderType,
    type,
    amount,
    items,
    cart,
    customer,
    table,
    reserveDate,
    reserveTime,
    memo,
    meta,
    storeId,
    agreePrivacy,
    orderName,
  } = body;

  const finalType = orderType || type;
  const finalCart = Array.isArray(items) ? items : (cart || []);

  const amt = typeof amount === "number" ? amount : Number(amount);
  if (!finalType || Number.isNaN(amt)) {
    return json(res, {
      ok: false,
      error: "INVALID_ORDER_PARAMS",
      detail: { type, amount },
    }, 400);
  }

  const { ts, date, dateTime } = makeTimeMeta();

  const finalStoreId = storeId;

  try {
    await assertValidStoreId(finalStoreId);
  } catch (e) {
    return json(res, {
      ok: false,
      error: e.message
    }, e.status || 400);
  }

  const initialStatus = (() => {
    if (finalType === 'reserve') return ORDER_STATUS.WAIT_PAY;
    return ORDER_STATUS.RECEIVED;
  })();

  const id = body.id || `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  console.log('[DEBUG stores]', await loadStores(), 'storeId:', finalStoreId);

  const orderNo = `${finalStoreId}-${finalType}-${Date.now()}`;

  const newOrder = {
    id,
    orderId: orderNo,
    type: finalType,
    amount: amt,
    orderName: orderName || null,
    cart: finalCart,
    customer: finalCustomer,
    reserve: finalReserve,
    table: table || null,
    status: initialStatus,
    ts,
    date,
    dateTime,
    storeId: finalStoreId,
    agreePrivacy: !!agreePrivacy,
  };

  try {
    const r = await OrdersDB.insertOrder({
      storeId: newOrder.storeId,
      orderNo: newOrder.orderId,
      status: newOrder.status,
      tableNo: newOrder.table,
      amount: newOrder.amount,
      meta: {
        customer: newOrder.customer,
        reserve: newOrder.reserve,
        type: newOrder.type,
        ts: newOrder.ts,
      },
      items: (newOrder.cart || []).map(it => ({
        name: it.name,
        qty: it.qty,
        unit_price: it.price || it.unit_price || 0,
        options: it.options || null,
      })),
    });
    console.log('[DB INSERT RESULT]', r);
  } catch (e) {
    console.error('[DB INSERT EXCEPTION]', e);
  }

  console.log("[BC SEND]", {
    orderType: finalType,
    storeId: finalStoreId,
    reserveDate,
    reserveTime,
  });

  return json(res, { ok: true, order: newOrder });
}

async function handlePut(req, res) {
  const adminStoreId = await getAdminStoreIdFromReq(req);

  if (!adminStoreId) {
    return json(res, {
      ok: false,
      error: "UNAUTHORIZED"
    }, 401);
  }

  const { orderId, status, meta, metaAppend } = req.body || {};

  if (!orderId) {
    return json(res, {
      ok: false,
      error: "MISSING_ORDER_ID"
    }, 400);
  }

  if (status === '결제완료' || status === '결제취소') {
    return json(res, {
      ok: false,
      error: 'INVALID_STATUS_FIELD',
      message: '결제 상태는 status로 변경할 수 없습니다.'
    }, 400);
  }

  if (meta?.payment && typeof status === 'string') {
    return json(res, {
      ok: false,
      error: 'PAYMENT_WITH_STATUS_NOT_ALLOWED'
    }, 400);
  }

  const history = metaAppend?.history || null;

  const r = await OrdersDB.updateOrder({
    storeId: adminStoreId,
    orderNo: orderId,
    status,
    meta,
    history,
  });

  if (!r.ok) {
    return json(res, {
      ok: false,
      error: "DB_UPDATE_FAILED",
      detail: r.error,
    }, 500);
  }

  return json(res, { ok: true });
}
