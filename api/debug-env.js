// /api/debug-env.js
// Edge Runtime에서 환경변수 파싱 에러를 확인하기 위한 디버그용 API
export const config = { runtime: "edge" };

export default async function handler(req) {
  const raw = process.env.ADMIN_USERS_JSON;
  const secret = process.env.JWT_SECRET;

  let parsed = null;
  let parseError = null;

  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    parseError = String(e);
  }

  return new Response(
    JSON.stringify(
      {
        ok: true,
        raw_ADMIN_USERS_JSON: raw ?? "(undefined)",
        JWT_SECRET_length: secret ? secret.length : "(undefined)",
        parsed_ADMIN_USERS_JSON: parsed,
        parseError,
      },
      null,
      2
    ),
    {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    }
  );
}
