// Tiny helper to mount Toss Payments Payment Widget
export async function loadPaymentWidget(clientKey, customerKey='guest'){
  // load script once
  if(!window.__tossPromise){
    window.__tossPromise = new Promise((resolve, reject)=>{
      const s=document.createElement('script');
      s.src='https://js.tosspayments.com/v1/payment-widget';
      s.onload=()=>resolve();
      s.onerror=reject;
      document.head.appendChild(s);
    });
  }
  await window.__tossPromise;
  // @ts-ignore
  return TossPayments(clientKey).payments; // v1 unified
}
