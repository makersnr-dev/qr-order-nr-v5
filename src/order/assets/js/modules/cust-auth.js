const TOKEN_KEY="qrnr.cust.jwt";
export function saveToken(t){ localStorage.setItem(TOKEN_KEY,t); }
export function getToken(){ return localStorage.getItem(TOKEN_KEY); }
export function clearToken(){ localStorage.removeItem(TOKEN_KEY); }
export async function requireCust(){
  const t=getToken(); if(!t){ location.href='/src/order/login.html'; return; }
  const r=await fetch('/api/verify',{method:'POST',body:t});
  if(!r.ok){ clearToken(); location.href='/src/order/login.html'; return; }
  const p=await r.json(); if(p.realm!=='cust'){ clearToken(); location.href='/src/order/login.html'; }
  return p;
}
