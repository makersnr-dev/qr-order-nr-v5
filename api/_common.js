
async function sign(payload){
  const enc=new TextEncoder(); 
  if (!process.env.JWT_SECRET) {
    throw new Error("CRITICAL ERROR: JWT_SECRET is not defined in environment variables.");
  }
  const secret = process.env.JWT_SECRET;
  const key=await crypto.subtle.importKey('raw', enc.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const head=btoa(JSON.stringify({alg:'HS256',typ:'JWT'})); const body=btoa(JSON.stringify(payload)); const data=`${head}.${body}`;
  const sig=await crypto.subtle.sign('HMAC',key,enc.encode(data));
  const b=btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  return `${data}.${b}`;
}
