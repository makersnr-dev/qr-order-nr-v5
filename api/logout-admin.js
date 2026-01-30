export const config = { runtime: "edge" };

export default async function handler(req) {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      // admin_token 쿠키를 즉시 만료시켜서 지웁니다.
      "set-cookie": `admin_token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
    }
  });
}
