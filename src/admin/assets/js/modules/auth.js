
const TOKEN_KEY="qrnr.jwt";
export function saveToken(t){ localStorage.setItem(TOKEN_KEY,t); }
export function getToken(){ return localStorage.getItem(TOKEN_KEY); }
export function clearToken(){ localStorage.removeItem(TOKEN_KEY); }
export async function requireAuth(realm){
  const t=getToken(); if(!t){ location.href='/login.html?realm=admin'; return; }
  const r=await fetch('/api/verify',{method:'POST',body:t});
  if(!r.ok){ clearToken(); location.href='/login.html?realm=admin'; return; }
  const p=await r.json(); if(p.realm!==(realm||'admin')){ clearToken(); location.href='/login.html?realm=admin'; }
  return p;
}
