// /api/stores.js
// 슈퍼관리자용 매장 관리 API (stores.json)

import fs from "fs/promises";
import { rateLimit } from "./_lib/rate-limit.js";
import { verifyJWT } from "../src/shared/jwt.js";

export const config = { runtime: "nodejs" };

const STORES_FILE = "/tmp/qrnr_stores.json";

/* ---------------------------
   공통 JSON 응답
--------------------------- */
function json(res, body, status = 200) {
  res.status(status).setHeader("content-type", "application/json");
  return res.send(JSON.stringify(body));
}

/* ---------------------------
   SUPER 관리자 인증
--------------------------- */
async function assertSuper(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    const e = new Error("NO_TOKEN");
    e.status = 401;
    throw e;
  }

  const token = auth.slice(7);

  const payload = await verifyJWT(
    token,
    process.env.JWT_SECRET || "dev-secret"
  );

  if (!payload?.isSuper) {
    const e = new Error("NOT_SUPER");
    e.status = 403;
    throw e;
  }

  return payload;
}


/* ---------------------------
   stores.json 로드 / 저장
--------------------------- */
async function loadStores() {
  try {
    const txt = await fs.readFile(STORES_FILE, "utf8");
    return JSON.parse(txt) || {};
  } catch {
    return {};
  }
}

async function saveStores(stores) {
  await fs.writeFile(
    STORES_FILE,
    JSON.stringify(stores, null, 2),
    "utf8"
  );
}

/* ---------------------------
   메인 핸들러
--------------------------- */
export default async function handler(req, res) {
  const limit = rateLimit(req, "stores");
  if (!limit.ok) {
    return json(res, { ok: false, error: limit.reason }, 429);
  }

  


  try {
    if (req.method === "GET") return handleGet(req, res);
    if (req.method === "POST") return handlePost(req, res);
    if (req.method === "PUT") return handlePut(req, res);
    if (req.method === "DELETE") return handleDelete(req, res);
    res.setHeader("Allow", "GET,POST,PUT,DELETE");
    return json(res, { ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  } catch (err) {
  console.error("[stores] error", err);

  return json(res, {
    ok: false,
    error: err.message || "INTERNAL_ERROR"
  }, err.status || 500);
}



/* ---------------------------
   GET /api/stores
   전체 매장 목록
--------------------------- */
async function handleGet(req, res) {
  const stores = await loadStores();
  return json(res, { ok: true, stores });
}

/* ---------------------------
   POST /api/stores
   매장 신규 생성
--------------------------- */
async function handlePost(req, res) {
  await assertSuper(req);
  const { storeId, code, name } = req.body || {};

  if (!storeId || !code) {
    return json(res, {
      ok: false,
      error: "INVALID_PARAMS"
    }, 400);
  }

  const stores = await loadStores();

  if (stores[storeId]) {
    return json(res, {
      ok: false,
      error: "STORE_ALREADY_EXISTS"
    }, 400);
  }

  stores[storeId] = {
    code: String(code).toUpperCase(),
    name: name || ""
  };

  await saveStores(stores);

  return json(res, { ok: true, store: stores[storeId] });
}

/* ---------------------------
   PUT /api/stores
   매장 수정 (code/name)
--------------------------- */
async function handlePut(req, res) {
  await assertSuper(req);
  const { storeId, code, name } = req.body || {};

  if (!storeId) {
    return json(res, {
      ok: false,
      error: "MISSING_STORE_ID"
    }, 400);
  }

  const stores = await loadStores();

  if (!stores[storeId]) {
    return json(res, {
      ok: false,
      error: "STORE_NOT_FOUND"
    }, 404);
  }

  if (code) {
    stores[storeId].code = String(code).toUpperCase();
  }
  if (name !== undefined) {
    stores[storeId].name = name;
  }

  await saveStores(stores);

  return json(res, { ok: true, store: stores[storeId] });
}

async function handleDelete(req, res) {
   await assertSuper(req);
   const { storeId } = req.body || {};

  if (!storeId) {
    return json(res, {
      ok: false,
      error: "MISSING_STORE_ID"
    }, 400);
  }

  const stores = await loadStores();

  if (!stores[storeId]) {
    return json(res, {
      ok: false,
      error: "STORE_NOT_FOUND"
    }, 404);
  }

  delete stores[storeId];
  await saveStores(stores);

  return json(res, { ok: true });
}

