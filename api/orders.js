// /api/orders.js
// 주문 조회 / 생성 / 상태 변경 API
// 현재는 /tmp/qrnr_orders.json 파일 기반 저장소 사용
// 나중에 DB로 바꾸려면 loadOrders / saveOrders만 수정하면 됨.

// PHASE 1-C
// 이 API는 PHASE 2에서 DB(Neon) 기반으로 전환됨
// API 인터페이스는 유지, 내부 구현만 교체

// TODO(PHASE 3-4):
// reservation lookup password will be stored in meta.lookupPassword

// ===================================================
// PHASE 2-5 COMPLETE
// - 프론트 payload 자유
// - 서버에서 normalize + validate
// - 테스트는 PHASE 3에서 진행
// ===================================================

// ===================================================
// ORDER API CONTRACT (FIXED)
// - orderType: 'store' | 'reserve' | 'delivery'
// - items: [{ id, name, qty, unitPrice, options }]
// - customer / reserve 는 선택
// - 프론트 payload 자유, 서버에서 normalize
// - 이 구조는 DB 이후에도 유지
// ===================================================


import * as OrdersDB from './_lib/db.orders.js';

import { getAuthFromReq } from '../src/shared/auth.js';


//import fs from "fs/promises";
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
  } catch {
    return null;
  }
}


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
/*async function loadOrders() {
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
}*/

// 🔒 storeId 실존 매장 검증 (PHASE 0-2 핵심)
async function assertValidStoreId(storeId) {
  if (!storeId) {
    const err = new Error('MISSING_STORE_ID');
    err.status = 400;
    throw err;
  }

  // PHASE 3-1: storeId "형식만" 확인
  // 실제 매장 존재 검증은 PHASE 3-2(JWT)에서 처리
  if (typeof storeId !== 'string' || storeId.length < 1) {
    const err = new Error('INVALID_STORE_ID');
    err.status = 400;
    throw err;
  }

  return true;
}



/*async function saveOrders(orders) {
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
}*/

/* ============================================================
   매장 정보 로딩 (슈퍼관리자 대비)
   ============================================================ */

/*const STORES_FILE = "/tmp/qrnr_stores.json";


// ⚠️ 로컬에서는 /api/_data/stores.json 읽어도 되고
// Vercel에서는 /tmp에 캐싱해도 됨

async function loadStores() {
  try {
    const txt = await fs.readFile(STORES_FILE, "utf8");
    return JSON.parse(txt) || {};
  } catch {
    return {};
  }
}*/


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
   주문번호 관련 헬퍼 
   ============================================================ */

// 🔹 매장 코드 결정 (지금은 storeId 그대로 사용)
async function getStoreCode(storeId) {
  const stores = await loadStores();
  return stores[storeId]?.code || String(storeId || 'STORE').toUpperCase();
}

// 🔹 주문 타입 코드
function getOrderTypeCode(type) {
  if (type === 'store') return 'S';
  if (type === 'reserve') return 'R';
  return 'O';
}

// 🔹 주문번호 생성
async function makeOrderNumber(orders, storeId, type) {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const dateKey = `${y}${m}${day}`;

  const storeCode = await getStoreCode(storeId);
  const typeCode = getOrderTypeCode(type);

  const prefix = `${storeCode}-${typeCode}`;

  const todayOrders = orders.filter(o =>
    o.orderId?.startsWith(`${prefix}-${dateKey}`)
  );

  const seq = String(todayOrders.length + 1).padStart(3, '0');
  return `${prefix}-${dateKey}-${seq}`;
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
/* ============================================================
   GET /api/orders
   🔒 0-2.5: 관리자 storeId 기준 주문 조회 제한
   ============================================================ */
async function handleGet(req, res) {
  const { type, from, to, storeId } = req.query || {};

  // 🔒 관리자 JWT에서 storeId 추출
  const adminStoreId = await getAdminStoreIdFromReq(req);

  // 🔒 관리자 + storeId 쿼리 불일치 → 차단
  if (adminStoreId && storeId && adminStoreId !== storeId) {
    return json(res, {
      ok: false,
      error: "STORE_MISMATCH",
      message: "다른 매장의 주문은 조회할 수 없습니다."
    }, 403);
  }

  // ===============================
  // ✅ PHASE 3-4: 관리자 → DB 조회
  // ===============================
  if (adminStoreId) {
    try {
      const r = await OrdersDB.listOrders({
        storeId: adminStoreId,
        type,
        from,
        to,
      });

      if (!r.ok) {
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
      }, 500);
    }
  }

  // ===============================
  // ⛳ 기존 JSON 로직 (비관리자)
  // ===============================

  const effectiveStoreId = storeId;

  /*const all = await loadOrders();
  let filtered = all.slice();

  if (type) {
    filtered = filtered.filter(o => o.type === type);
  }

  if (effectiveStoreId) {
    filtered = filtered.filter(o => o.storeId === effectiveStoreId);
  }

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

  return json(res, {
    ok: true,
    orders: filtered,
    source: "json",
  });
}*/
/////////////////////////////////////////////////////////////////


function normalizeOrderInput(body) {
  const {
    customer = {},
    reserve = {},
    reserveDate,
    reserveTime,
    memo,
    meta = {},
  } = body;

  // ✅ customer 정규화
  const finalCustomer = {
    name: customer.name || "",
    phone: customer.phone || "",
    addr: customer.addr || "",
    memo:
      customer.memo ||
      customer.req ||
      memo ||
      meta.req ||
      "",
  };

  // ✅ reserve 정규화
  const finalReserve = {
    date:
      reserve.date ||
      reserveDate ||
      meta.reserveDate ||
      "",
    time:
      reserve.time ||
      reserveTime ||
      meta.reserveTime ||
      "",
  };

  return { finalCustomer, finalReserve };
}


/* ============================================================
   POST /api/orders
   ============================================================ */
async function handlePost(req, res) {

  const body = req.body || {};

  const auth = await getAuthFromReq(req);

  // JWT에 storeId가 있으면 body.storeId보다 우선
  if (auth?.storeId && !body.storeId) {
    body.storeId = auth.storeId;
  }
  
  const { finalCustomer, finalReserve } = normalizeOrderInput(body);

  let {
    //orderId,
    orderType,   // ✅ 새 필드
    type,        // 🔙 하위호환
    amount,
    items,       // ✅ 새 필드
    cart,        // 🔙 하위호환
    customer,
    table,
    //status,
    reserveDate,
    reserveTime,
    memo,
    meta,
    storeId,
    agreePrivacy,
    orderName,
  } = body;




  // ✅ type 통합 (store / reserve / delivery)
  const finalType = orderType || type;

  // ✅ cart 통합
  const finalCart = Array.isArray(items) ? items : (cart || []);


  const amt = typeof amount === "number" ? amount : Number(amount);
  if (!finalType || Number.isNaN(amt)) {
    return json(res, {
      ok: false,
      error: "INVALID_ORDER_PARAMS",
      detail: { type, amount },
    }, 400);
  }

  //const orders = await loadOrders();

  const { ts, date, dateTime } = makeTimeMeta();

  const finalStoreId = storeId;

  // 🔒 storeId 실존 매장 검증
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


  const id =
    body.id ||
    `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  console.log(
    '[DEBUG stores]',
    await loadStores(),
    'storeId:',
    finalStoreId
  );

    const orderNo =
  `${finalStoreId}-${finalType}-${Date.now()}`;


  /*const orderNo = await makeOrderNumber(
    orders,
    finalStoreId,
    finalType
  );*/



  const newOrder = {
    id,
    orderId: orderNo,
    //orderNo,

    // ✅ 통합된 타입
    type: finalType,

    amount: amt,

    // ❌ orderName은 이제 의미 없음 (유지해도 되지만 안 씀)
    orderName: orderName || null,

    // ✅ 핵심: items / cart 통합
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


  //orders.push(newOrder);
  //await saveOrders(orders);

  // ===============================
  // PHASE 3-3: DB INSERT (병행)
  // ===============================
  
try {
  const r =await OrdersDB.insertOrder({
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
  /*.then(r => {
    if (!r.ok) {
      console.error('[DB INSERT FAILED]', r.error);
    } else {
      console.log('[DB INSERT OK]', r.orderId);
    }
  }).catch(e => {
    console.error('[DB INSERT EXCEPTION]', e);
  });*/
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


/* ============================================================
   PUT /api/orders
   ============================================================ */

async function handlePut(req, res) {

  
  return json(res, {
    ok: false,
    error: "NOT_IMPLEMENTED",
    message: "주문 상태 변경은 DB 단계(3-3)에서 구현됩니다."
  }, 501);


  
  // 🔒 상태 전이 규칙 (구조 고정)

  const { id, orderId, status, meta } = req.body || {};

  if (!id && !orderId) {
    return json(res, { ok: false, error: "MISSING_ID" }, 400);
  }


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

  // 🔒 0-2.5: 주문 소유 매장 검증
  const adminStoreId = await getAdminStoreIdFromReq(req);

  if (adminStoreId && target.storeId !== adminStoreId) {
    return json(res, {
      ok: false,
      error: "STORE_MISMATCH",
      message: "다른 매장의 주문은 수정할 수 없습니다."
    }, 403);
  }

  // ⚠️ 중요:
  // - 결제 완료(POS 확인)는 status 변경이 아니다.
  // - meta.payment 업데이트용 PUT은 status 없이 호출된다.
  // - 이 handler는 "상태 변경 요청" 전용이다.
  if (typeof status === 'string') {
    const currentStatus = target.status;
    const orderType = target.type; // store / reserve

    const allowedNext =
      STATUS_FLOW[orderType]?.[currentStatus] || [];

    // 🔒 0-4-3-1: 결제 상태 문자열이 status로 들어오면 차단
    if (
      status === '결제완료' ||
      status === '결제취소'
    ) {
      return json(res, {
        ok: false,
        error: 'INVALID_STATUS_FIELD',
        message: '결제 상태는 status로 변경할 수 없습니다.'
      }, 400);
    }

    // 🔒 0-4-3-2: 주문 타입 없는 상태 변경 차단
    if (!target.type) {
      return json(res, {
        ok: false,
        error: 'ORDER_TYPE_MISSING',
        message: '주문 타입이 없는 상태 변경 요청입니다.'
      }, 400);
    }


    if (!allowedNext.includes(status)) {
      return json(res, {
        ok: false,
        error: 'INVALID_STATUS_CHANGE',
        detail: {
          from: currentStatus,
          to: status,
        }
      }, 400);
    }

    // 🔒 결제취소는 "결제 완료된 주문"만 허용
    // 🔒 0-4-2: 결제 완료된 주문은 주문취소 불가
    if (
      status === ORDER_STATUS.CANCELLED &&
      target.meta?.payment?.paid === true
    ) {
      return json(res, {
        ok: false,
        error: 'ORDER_CANCEL_BLOCKED',
        message: '결제 완료된 주문은 주문취소할 수 없습니다.'
      }, 400);
    }

    target.status = status;
  }

  // ✅ STEP 2-4-1: 결제 확인 요청은 status 없이만 허용
if (
  meta?.payment &&
  typeof status === 'string'
) {
  return json(res, {
    ok: false,
    error: 'PAYMENT_WITH_STATUS_NOT_ALLOWED',
    message: '결제 확인 요청에는 status를 포함할 수 없습니다.'
  }, 400);
}

  
const prevPaid = target.meta?.payment?.paid;

  // ✅ STEP 2-1: 결제 정보(meta.payment) 처리
// - 결제는 status가 아님
// - 관리자 결제 확인 버튼 대응
if (
  meta &&
  typeof meta === 'object' &&
  meta.payment &&
  typeof meta.payment === 'object'
) {
  const prevPayment = target.meta?.payment || {};

  target.meta = {
    ...(target.meta || {}),
    payment: {
      ...prevPayment,
      ...meta.payment,
      paid: !!meta.payment.paid,
      paidAt: meta.payment.paid
        ? meta.payment.paidAt || Date.now()
        : null,
    },
  };
}




  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    target.meta = { ...(target.meta || {}), ...meta };
  }
  // ✅ metaAppend 처리 (history 누적용)
  if (req.body?.metaAppend && typeof req.body.metaAppend === 'object') {
    const append = req.body.metaAppend;

    // history 누적
    if (append.history) {
      const prev = Array.isArray(target.meta?.history)
        ? target.meta.history
        : [];

      const nextItems = Array.isArray(append.history)
        ? append.history
        : [append.history];

      target.meta = {
        ...(target.meta || {}),
        history: [...prev, ...nextItems]
      };
    }
  }


  //orders[idx] = target;
  //await saveOrders(orders);

  return json(res, { ok: true, order: target });
}



