// /api/super-logout.js
export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    return new Response(
      JSON.stringify({ ok: true }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": `super_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`,
        },
      }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false }), { status: 500 });
  }
}
