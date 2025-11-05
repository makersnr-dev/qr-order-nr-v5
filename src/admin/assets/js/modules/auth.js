
const TOKEN_KEY="qrnr.jwt";
export function saveToken(t){ localStorage.setItem(TOKEN_KEY,t); }
export function getToken(){ return localStorage.getItem(TOKEN_KEY); }
export function clearToken(){ localStorage.removeItem(TOKEN_KEY); }
export async function requireAuth(realm){
  const t=getToken();
  const here=location.pathname;
  const loginPath='/admin/login';
  if(!t){
    if(!here.startsWith(loginPath)) location.href=loginPath;
    return null;
  }
  const r=await fetch('/api/verify',{method:'POST',body:t});
  if(!r.ok){
    clearToken();
    if(!here.startsWith(loginPath)) location.href=loginPath;
    return null;
  }
  const p=await r.json();
  if(p.realm!==(realm||'admin')){
    clearToken();
    if(!here.startsWith(loginPath)) location.href=loginPath;
    return null;
  }
  return p;
}
  const r=await fetch('/api/verify',{method:'POST',body:t});
  if(!r.ok){ clearToken(); location.href='/admin'; return; }
  const p=await r.json(); if(p.realm!==(realm||'admin')){ clearToken(); location.href='/admin'; }
  return p;
}
