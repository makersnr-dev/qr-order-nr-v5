// unified toss-client.js
export async function getTossClientKey(){
  const r = await fetch('/api/config',{cache:'no-store'});
  const c = await r.json();
  if(!c || !c.tossClientKey) throw new Error('Missing TOSS client key');
  return c.tossClientKey;
}
async function loadScript(src,id){
  if(document.getElementById(id)) return;
  await new Promise((res,rej)=>{ const s=document.createElement('script'); s.id=id; s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
}
export async function ensureToss(){
  await loadScript('https://js.tosspayments.com/v1/payment','tosspayments-script');
  const key = await getTossClientKey();
  if(!window.TossPayments) throw new Error('TossPayments not loaded');
  return window.TossPayments(key);
}
export function setPendingOrder(data){
  try{ sessionStorage.setItem('qrnr.pendingOrder', JSON.stringify(data)); }catch(e){}
}
export function getPendingOrder(){
  try{ return JSON.parse(sessionStorage.getItem('qrnr.pendingOrder')||'null'); }catch(e){ return null; }
}
export async function startPayment({orderId, amount, orderName}){
  const client = await ensureToss();
  const successUrl = location.origin + '/toss/success?orderId='+encodeURIComponent(orderId)+'&amount='+encodeURIComponent(amount);
  const failUrl = location.origin + '/toss/fail?orderId='+encodeURIComponent(orderId);
  return client.requestPayment({
    amount: Number(amount),
    orderId: String(orderId),
    orderName: String(orderName||'주문'),
    successUrl, failUrl
  });
}
