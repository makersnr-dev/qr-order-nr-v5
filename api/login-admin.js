// /api/login-admin.js (DEBUG VERSION)

export const config = { runtime: 'edge' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

// Base64URL encoding helper
function encodeB64Url(input) {
  return btoa(input)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function sign(payload) {
  const enc = new TextEncoder();
  const secret = process.env.JWT_SECRET || "dev-secret-please-change";

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const header = encodeB64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body   = encodeB64Url(JSON.stringify(payload));
  const data = `${header}.${body}`;

  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const bytes = new Uint8Array(sig);
  let sigStr = "";
  for (let i = 0; i < bytes.length; i++) {
    sigStr += String.fromCharCode(bytes[i]);
  }

  return `${data}.${encodeB64Url(sigStr)}`;
}

export default async function handler(req) {
  try {
    if (req.method !== "POST") {
      return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
    }

    // ----- STEP 1: Body 파싱 -----
    let body;
    try {
      body = await req.json();
    } catch (err) {
      return json({
        ok: false,
        error: "BAD_JSON",
        debug: `JSON parse error: ${String(err)}`
      }, 400);
    }

    const uid = (body?.uid || "").trim();
    const pwd = (body?.pwd || "").trim();

    if (!uid || !pwd) {
      return json({
        ok: false,
        error: "ID_OR_PW_EMPTY"
      }, 400);
    }

    // ----- STEP 2: 환경변수 확인 -----
    const raw = process.env.ADMIN_USERS_JSON;

    if (!raw) {
      return json({
        ok: false,
        error: "ENV_NOT_FOUND",
        debug: {
          msg: "ADMIN_USERS_JSON 환경변수가 없습니다.",
          rawValue: raw
        }
      }, 500);
    }

    // ----- STEP 3: JSON 파싱 테스트 -----
    let users = null;
    try {
      users = JSON.parse(raw);
    } catch (err) {
      return json({
        ok: false,
        error: "JSON_PARSE_FAILED",
        debug: {
          message: String(err),
          rawValue: raw
        }
      }, 500);
    }

    // ----- STEP 4: 찾은 유저 정보 표시 (디버그) -----
    const match = users.find(u => u.id === uid && u.pw === pwd);

    if (!match) {
      return json({
        ok: false,
        error: "INVALID_CREDENTIALS",
        debug: {
          receivedUid: uid,
          receivedPw: pwd,
          usersParsed: users
        }
      }, 401);
    }

    if (!match.storeId) {
      return json({
        ok: false,
        error: "STORE_ID_MISSING",
        debug: {
          user: match,
          rawValue: raw
        }
      }, 500);
    }

    // ----- STEP 5: 정상 토큰 생성 -----
    const payload = {
      sub: uid,
      uid,
      realm: "admin",
      provider: match.provider || "local",
      name: match.name || uid,
      storeId: match.storeId,
      iat: Math.floor(Date.now() / 1000),
    };

    const token = await sign(payload);

    // 디버그 모드라 토큰도 그대로 노출
    return json({
      ok: true,
      user: payload,
      token,
      debug: {
        rawEnv: raw,
        parsedUsers: users
      }
    });

  } catch (err) {
    return json({
      ok: false,
      error: "UNCAUGHT_ERROR",
      debug: String(err)
    }, 500);
  }
}
