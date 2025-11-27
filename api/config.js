export default async function handler(req, res){
  res.json({
    tossClientKey: process.env.TOSS_CLIENT_KEY || "",
    origin: req.headers['x-forwarded-host'] ? `https://${req.headers['x-forwarded-host']}` : ''
  });
}
