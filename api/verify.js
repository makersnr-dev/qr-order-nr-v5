
export const config={runtime:'edge'};
function json(b,s=200){return new Response(JSON.stringify(b),{status:s,headers:{'content-type':'application/json;charset=utf-8'}});}
async function verify(token){
  const [h,b,s]=String(token||'').split('.'); if(!h||!b||!s) throw 0;
  const enc=new TextEncoder(); const secret=(process.env.JWT_SECRET||'dev-secret-please-change');
  const key=await crypto.subtle.importKey('raw', enc.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const data=`${h}.${b}`; const sig=await crypto.subtle.sign('HMAC',key,enc.encode(data));
  const sigb=btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  if(sigb!==s) throw 0; return JSON.parse(atob(b));
}
export default async function handler(req){ if(req.method!=='POST') return json({error:'Method'},405);
  try{ const payload=await verify(await req.text()); return json(payload); } catch(_){ return json({ok:false},401); } }
