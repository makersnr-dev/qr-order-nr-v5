// shared toss client loader
export async function getTossClientKey(){
  const r = await fetch('/api/config', {cache:'no-store'});
  const c = await r.json();
  if(!c || !c.tossClientKey) throw new Error('Missing TOSS client key');
  return c.tossClientKey;
}
export async function loadPaymentWidget(){
  if(!document.getElementById('tosspayments-script')){
    await new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.id='tosspayments-script';
      s.src='https://js.tosspayments.com/v1/payment-widget';
      s.onload=res; s.onerror=rej; document.head.appendChild(s);
    });
  }
  const key = await getTossClientKey();
  return window.PaymentWidget ? new window.PaymentWidget(key, PaymentWidget.ANONYMOUS) : null;
}