// Admin auth module — hardened
const TOKEN_KEY = "qrnr.jwt";
export function saveToken(t){ try{ localStorage.setItem(TOKEN_KEY,t);}catch(e){} }
export function getToken(){ try{ return localStorage.getItem(TOKEN_KEY);}catch(e){ return null; } }
export function clearToken(){ try{ localStorage.removeItem(TOKEN_KEY);}catch(e){} }
export async function requireAuth(realm){
  const here = location.pathname; const loginPath = '/admin/login';
  try{
    const t = getToken();
    if(!t){ if(!here.startsWith(loginPath)) location.href = loginPath; return null; }
    const r = await fetch('/api/verify',{method:'POST',body:t,cache:'no-store'});
    if(!r.ok){ clearToken(); if(!here.startsWith(loginPath)) location.href = loginPath; return null; }
    const p = await r.json();
    if(p.realm !== (realm||'admin')){ clearToken(); if(!here.startsWith(loginPath)) location.href = loginPath; return null; }
    return p;
  }catch(e){ if(!here.startsWith(loginPath)) location.href = loginPath; return null; }
}
// optional helper
export function redirectIfLoggedIn(){
  const here = location.pathname; const t = getToken();
  if(t && here.startsWith('/admin/login')){ try{ history.replaceState(null,'','/admin'); }catch(e){} location.href='/admin'; }
}