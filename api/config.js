// /api/config.js

// ✅ 이 파일은 Edge가 아니라 Node.js 런타임으로 실행하게 강제
export const config = {
  runtime: 'nodejs',
};

export default async function handler(req, res) {
  res.json({
    tossClientKey: process.env.TOSS_CLIENT_KEY || "",
    origin: req.headers['x-forwarded-host']
      ? `https://${req.headers['x-forwarded-host']}`
      : '',
  });
}
