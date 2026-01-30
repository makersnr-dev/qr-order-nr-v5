// /api/orders.js
import * as OrdersDB from './_lib/db.orders.js';
import { queryOne } from './_lib/db.js'; // ✅ 매장 검증용 추가
import { getAuthFromReq } from '../src/shared/auth.js';
import { rateLimit } from "./_lib/rate-limit.js";
import { ORDER_STATUS } from '../src/shared/constants/status.js';
import { verifyJWT } from "../src/shared/jwt.js";

export const config = { runtime: "nodejs" };

// --- 보조 함수들 ---

async function getAdminStoreIdFromReq(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  try {
    const payload = await verifyJWT(token, process.env.JWT_SECRET || "dev-secret");
    return payload?.storeId || null;
  } catch (e) { return null; }
}

function json(res, body, status = 200) {
  res.status(status).setHeader("content-type", "application/json");
  return res.send(JSON.stringify(body));
}

// 🔒 DB를 조회해서 진짜 존재하는 매장인지 확인 (최소 수정 핵심)
async function assertValidStoreId(storeId) {
  if (!storeId) throw new Error('MISSING_STORE_ID');
  const store = await queryOne('SELECT store_id FROM stores WHERE store_id = $1', [storeId]);
  if (!store) throw new Error('INVALID_STORE_ID');
  return true;
}

function makeTimeMeta() {
  const ts = Date.now();
  const k = new Date(ts + (9 * 60 * 60 * 1000)); // KST
  const iso = k.toISOString();
  return {
    ts,
    date: iso.slice(0, 10),
    dateTime: iso.replace('T', ' ').slice(0, 16),
  };
}

// --- 메인 핸들러 ---

export default async function handler(req, res) {
  const limit = rateLimit(req, "orders");
  if (!limit.ok) return json(res, { ok: false, error: limit.reason }, 429);

  try {
    if (req.method === "GET") return handleGet(req, res);
    if (req.method === "POST") return handlePost(req, res);
    if (req.method === "PUT") return handlePut(req, res);
    return json(res, { ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  } catch (err) {
    console.error("[orders error]", err);
    return json(res, { ok: false, error: err.message }, 500);
  }
}

async function handleGet(req, res) {
  const { type, from, to, storeId } = req.query || {};
  const adminStoreId = await getAdminStoreIdFromReq(req);

  // 관리자는 본인 매장만, 아니면 요청된 storeId 사용
  const targetStoreId = adminStoreId || storeId;
  if (!targetStoreId) return json(res, { ok: true, orders: [] });

  const r = await OrdersDB.listOrders({ storeId: targetStoreId, type, from, to });
  return json(res, r);
}

async function handlePost(req, res) {
  const body = req.body || {};
  const { storeId, amount, items, cart, table, orderType, type, customer, reserve } = body;

  const finalStoreId = storeId;
  await assertValidStoreId(finalStoreId); // DB 검증

  const finalType = orderType || type;
  const finalCart = Array.isArray(items) ? items : (cart || []);
  const { ts, date, dateTime } = makeTimeMeta();

  const initialStatus = finalType === 'reserve' ? ORDER_STATUS.WAIT_PAY : ORDER_STATUS.RECEIVED;
  const orderNo = `${finalStoreId}-${finalType}-${Date.now()}`;

  // DB 저장
  const r = await OrdersDB.insertOrder({
    storeId: finalStoreId,
    orderNo: orderNo,
    status: initialStatus,
    tableNo: table || null,
    amount: Number(amount),
    meta: { customer, reserve, type: finalType, ts },
    items: finalCart.map(it => ({
      name: it.name,
      qty: it.qty,
      unit_price: it.price || it.unit_price || 0,
      options: it.options || null,
    })),
  });

  return json(res, { ok: true, order: { ...body, orderId: orderNo, status: initialStatus, dateTime } });
}

async function handlePut(req, res) {
  const adminStoreId = await getAdminStoreIdFromReq(req);
  if (!adminStoreId) return json(res, { ok: false, error: "UNAUTHORIZED" }, 401);

  const { orderId, status, meta, metaAppend } = req.body || {};
  const r = await OrdersDB.updateOrder({
    storeId: adminStoreId,
    orderNo: orderId,
    status,
    meta,
    history: metaAppend?.history || null,
  });

  return json(res, r);
}
