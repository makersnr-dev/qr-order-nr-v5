// /api/super-logout.js
export const config = { runtime: "edge" };

export default async function handler(req) {
  return new Response(
    JSON.stringify({ ok: true }),
    {
      status: 200,
      headers: { "content-type": "application/json" }
    }
  );
}
