// /api/super-logout.js
export const config = { runtime: "edge" };

export default async function handler(req) {
  return new Response(
    JSON.stringify({ ok: true }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        // 🔥 SUPER 로그아웃 핵심: 쿠키 삭제
        "set-cookie": "super_token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"
      }
    }
  );
}
