// /api/logout-admin.js
export const config = { runtime: "edge" };

export default async function handler(req) {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": `auth_token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
    }
  });
}
