// /src/shared/jwt.js
//---------------------------------------------
// Base64URL helpers
//---------------------------------------------
function toBase64Url(uint8) {
  let str = "";
  for (let i = 0; i < uint8.length; i++) {
    str += String.fromCharCode(uint8[i]);
  }
  return btoa(str)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function jsonToBase64Url(obj) {
  return btoa(JSON.stringify(obj))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlToUint8(str) {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

//---------------------------------------------
// signJWT (HS256)
//---------------------------------------------
export async function signJWT(payload, secret, expiresInSec = 3600) {
  const header = { alg: "HS256", typ: "JWT" };
  const exp = Math.floor(Date.now() / 1000) + expiresInSec;

  const fullPayload = { ...payload, exp };

  // base64url header / payload
  const headerB64 = jsonToBase64Url(header);
  const payloadB64 = jsonToBase64Url(fullPayload);

  const data = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );

  const sigB64 = toBase64Url(new Uint8Array(sigBuf));
  return `${data}.${sigB64}`;
}

//---------------------------------------------
// verifyJWT (HS256)
//---------------------------------------------
export async function verifyJWT(token, secret) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, sigB64] = parts;

    const data = `${headerB64}.${payloadB64}`;
    const sig = base64UrlToUint8(sigB64);

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      sig,
      new TextEncoder().encode(data)
    );

    if (!ok) return null;

    // 디코드
    const padded = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4;
    const base64 = pad ? padded + "=".repeat(4 - pad) : padded;
    const json = atob(base64);
    const payload = JSON.parse(json);

    // exp 체크
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch (e) {
    console.error("[verifyJWT] error:", e);
    return null;
  }
}
