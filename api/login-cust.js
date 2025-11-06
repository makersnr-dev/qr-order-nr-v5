export const config={runtime:'edge'};
function json(b,s=200){return new Response(JSON.stringify(b),{status:s,headers:{'content-type':'application/json;charset=utf-8'}});}
async function sign(payload){
  const enc=new TextEncoder(); const secret=(process.env.JWT_SECRET||'dev-secret-please-change');
  const key=await crypto.subtle.importKey('raw', enc.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const head=btoa(JSON.stringify({alg:'HS256',typ:'JWT'}));
  const body=btoa(JSON.stringify(payload));
  const data=`${head}.${body}`;
  const sig=await crypto.subtle.sign('HMAC',key,enc.encode(data));
  const b=btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  return `${data}.${b}`;
}
export default async function handler(req){
  if(req.method!=='POST') return json({error:'Method'},405);
  const {uid,pwd}=await req.json();
  const raw=process.env.CUST_USERS_JSON||'[{"id":"user","pw":"1234"}]';
  let users; try{users=JSON.parse(raw);}catch(_){return json({error:'bad CUST_USERS_JSON'},500);}
  const ok=users.some(u=>u.id===uid && u.pw===pwd);
  if(!ok) return json({ok:false},401);
  const token=await sign({uid,realm:'cust',iat:Math.floor(Date.now()/1000)});
  return json({ok:true,token});
}
