export const config={runtime:'edge'};
function json(b,s=200,h={'content-type':'application/json;charset=utf-8'}){return new Response(typeof b==='string'?b:JSON.stringify(b),{status:s,headers:h});}
export default async function handler(req){
  if(req.method!=='POST') return json({error:'Method'},405);
  const {paymentKey, orderId, amount}=await req.json();
  if(!paymentKey||!orderId||!amount) return json({error:'bad params'},400);
  const secret = process.env.TOSS_SECRET_KEY;
  if(!secret) return json({error:'missing TOSS_SECRET_KEY'},500);
  const basic = 'Basic '+btoa(secret+':');
  const r = await fetch('https://api.tosspayments.com/v1/payments/confirm',{
    method:'POST',
    headers:{'authorization':basic,'content-type':'application/json'},
    body: JSON.stringify({paymentKey, orderId, amount})
  });
  const text = await r.text();
  if(!r.ok) return json(text, r.status, {'content-type':'text/plain;charset=utf-8'});
  return json(text, 200, {'content-type':'application/json;charset=utf-8'});
}
