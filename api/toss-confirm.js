
// api/toss-confirm.js
export default async function handler(req, res){
  try{
    let body='';
    await new Promise(r=>req.on('data',c=>body+=c).on('end',r));
    const { paymentKey, orderId, amount, payload } = JSON.parse(body||'{}');

    if(!paymentKey || !orderId || !amount){
      return res.status(400).json({ ok:false, error:'missing fields'});
    }
    const secret = process.env.TOSS_SECRET_KEY;
    if(!secret){
      // dev stub approve
      return res.status(200).json({ ok:true, stub:true });
    }
    const r1 = await fetch('https://api.tosspayments.com/v1/payments/confirm',{
      method:'POST',
      headers:{
        'Authorization': `Basic ${Buffer.from(secret + ':').toString('base64')}`,
        'Content-Type':'application/json'
      },
      body: JSON.stringify({ paymentKey, orderId, amount })
    });
    const body1 = await r1.json();
    if(!r1.ok) return res.status(500).json({ ok:false, body: body1 });
    return res.status(200).json({ ok:true, body: body1 });
  }catch(e){
    return res.status(500).json({ ok:false, error:String(e) });
  }
}
