// /src/shared/jwt.js
// Vercel Edge 호환 HS256 JWT (Base64URL + Unicode safe)

function base64UrlEncode(buf) {
  return btoa(String.fromCharCode(...buf))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlEncodeText(str) {
  const utf8 = new TextEncoder().encode(str);
  return base64UrlEncode(utf8);
}

function base64UrlDecodeToBytes(b64url) {
  const base64 = b64url.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (b64url.length % 4)) % 4);

  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ----------------------------------------------------
// HS256 SIGN
// ----------------------------------------------------
export async function signJWT(payload, secret, expiresInSec = 3600) {
  const header = { alg: "HS256", typ: "JWT" };
  const exp = Math.floor(Date.now() / 1000) + expiresInSec;

  const fullPayload = { ...payload, exp };

  const headerBase = base64UrlEncodeText(JSON.stringify(header));
  const payloadBase = base64UrlEncodeText(JSON.stringify(fullPayload));

  const data = `${headerBase}.${payloadBase}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );

  const sigBase = base64UrlEncode(new Uint8Array(sig));

  return `${data}.${sigBase}`;
}

// ----------------------------------------------------
// JWT VERIFY
// ----------------------------------------------------
export async function verifyJWT(token, secret) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, sigB64] = parts;

    const data = `${headerB64}.${payloadB64}`;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBytes = base64UrlDecodeToBytes(sigB64);

    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(data)
    );

    if (!ok) return null;

    const payloadJson = new TextDecoder().decode(
      base64UrlDecodeToBytes(payloadB64)
    );

    const payload = JSON.parse(payloadJson);

    // exp expired?
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;

    return payload;
  } catch (err) {
    console.error("[verifyJWT error]", err);
    return null;
  }
}
