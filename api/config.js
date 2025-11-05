export default async function handler(req, res) {
  res.json({
    tossClientKey: process.env.TOSS_CLIENT_KEY || ""
  });
}
