// /api/debug-env.js
// 환경변수 디버그용 (개발 중에만 사용 권장)

export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  const raw = process.env.ADMIN_USERS_JSON || null;
  const jwt = process.env.JWT_SECRET || null;

  let parsed = null;
  let parseError = null;

  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      parseError = String(e);
    }
  }

  const body = {
    ok: true,
    raw_ADMIN_USERS_JSON: raw,
    JWT_SECRET_length: jwt ? jwt.length : 0,
    parsed_ADMIN_USERS_JSON: parsed,
    parseError,
  };

  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
