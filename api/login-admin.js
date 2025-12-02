// /api/login-admin.js
// 관리자 로그인 (Node.js 서버리스 함수 + HS256 JWT)
// 요청:  POST { uid, pwd }
// 환경변수 예시:
//   ADMIN_USERS_JSON = [{"id":"admin1","pw":"1234","name":"매장관리자1","provider":"local","storeId":"narae"}, ...]
//   JWT_SECRET       = "아주_길게_아무_문자열"

import crypto from 'crypto';

export const config = {
  runtime: 'nodejs', // 🔹 이 파일은 edge 말고 nodejs 런타임으로 고정
};

// ─────────────────────────────
// 공통 헬퍼들
// ─────────────────────────────

// Node.js req 에서 JSON 바디 읽기
async function readJson(req) {
  // Vercel이 body를 이미 객체로 넣어준 경우도 있어서 한 번 체크
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, body, status = 200) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

// HS256 JWT 생성 (header.payload.signature)
function signJwt(payload) {
  const secret = process.env.JWT_SECRET || 'dev-secret-please-change';

  const headerPart = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    'utf8'
  ).toString('base64url');

  const bodyPart = Buffer.from(
    JSON.stringify(payload),
    'utf8'
  ).toString('base64url');

  const data = `${headerPart}.${bodyPart}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64url');

  return `${data}.${signature}`;
}

// ─────────────────────────────
// 메인 핸들러
// ─────────────────────────────
export default async function handler(req, res) {
  try {
    // 1) 메서드 체크
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(
        res,
        { ok: false, error: 'METHOD_NOT_ALLOWED' },
        405
      );
    }

    // 2) JSON 바디 파싱
    let body;
    try {
      body = await readJson(req);
    } catch (e) {
      console.error('[login-admin] BAD_JSON', e);
      return sendJson(res, { ok: false, error: 'BAD_JSON' }, 400);
    }

    const uid = (body && body.uid ? String(body.uid) : '').trim();
    const pwd = (body && body.pwd ? String(body.pwd) : '').trim();

    if (!uid || !pwd) {
      return sendJson(
        res,
        { ok: false, error: 'ID_AND_PASSWORD_REQUIRED' },
        400
      );
    }

    // 3) 디버그 모드: uid === "__debug__" 일 때 env 확인용
    if (uid === '__debug__') {
      const raw = process.env.ADMIN_USERS_JSON || '';
      let parsed = null;
      let parseError = null;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch (e) {
        parseError = e.message;
      }

      return sendJson(res, {
        ok: true,
        raw_ADMIN_USERS_JSON: raw,
        JWT_SECRET_length: (process.env.JWT_SECRET || '').length,
        parsed_ADMIN_USERS_JSON: parsed,
        parseError,
      });
    }

    // 4) 관리자 계정 목록 읽기 (환경변수)
    const rawAdmins =
      process.env.ADMIN_USERS_JSON ||
      '[{"id":"admin","pw":"1234","name":"관리자","provider":"local","storeId":"store1"}]';

    let users;
    try {
      users = JSON.parse(rawAdmins);
    } catch (e) {
      console.error('[login-admin] ADMIN_USERS_JSON parse error', e);
      return sendJson(
        res,
        { ok: false, error: 'BAD_ADMIN_USERS_JSON' },
        500
      );
    }

    const user =
      Array.isArray(users) &&
      users.find((u) => u && u.id === uid && u.pw === pwd);

    if (!user) {
      // 아이디/비번 틀림
      return sendJson(
        res,
        { ok: false, error: 'INVALID_CREDENTIALS' },
        401
      );
    }

    // 5) storeId 필수
    const storeId =
      user.storeId ||
      user.store ||
      user.store_id ||
      null;

    if (!storeId) {
      return sendJson(
        res,
        { ok: false, error: 'STORE_ID_NOT_SET_FOR_ADMIN' },
        500
      );
    }

    // 6) JWT payload 구성 (storeId 포함)
    const payload = {
      sub: uid,
      uid,
      realm: 'admin',
      provider: user.provider || 'local',
      name: user.name || uid,
      storeId, // 🔥 여기서 최종 매장ID가 강제로 들어감
      iat: Math.floor(Date.now() / 1000),
    };

    const token = signJwt(payload);

    // 7) 최종 응답
    return sendJson(res, {
      ok: true,
      token,
      user: payload,
    });
  } catch (e) {
    console.error('[login-admin] top-level error', e);
    return sendJson(
      res,
      {
        ok: false,
        error: 'INTERNAL_ERROR',
        detail: e?.message || String(e),
      },
      500
    );
  }
}
