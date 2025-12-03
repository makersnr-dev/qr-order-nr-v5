// /src/shared/jwt.js
export async function signJWT(payload, secret, expiresInSec = 3600) {
  const header = { alg: "HS256", typ: "JWT" };
  const exp = Math.floor(Date.now() / 1000) + expiresInSec;

  const fullPayload = { ...payload, exp };

  const enc = new TextEncoder();

  const headerBase = btoa(JSON.stringify(header));
  const payloadBase = btoa(JSON.stringify(fullPayload));

  const toSign = `${headerBase}.${payloadBase}`;

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(toSign));
  const sigBase = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  return `${toSign}.${sigBase}`;
}

export async function verifyJWT(token, secret) {
  try {
    const [headerB, payloadB, sigB] = token.split(".");
    if (!headerB || !payloadB || !sigB) return null;

    const enc = new TextEncoder();
    const data = `${headerB}.${payloadB}`;

    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sig = Uint8Array.from(atob(sigB), (c) => c.charCodeAt(0));

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sig,
      enc.encode(data)
    );

    if (!valid) return null;

    const payloadStr = atob(payloadB);
    const payload = JSON.parse(payloadStr);

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch (e) {
    console.error("[verifyJWT error]", e);
    return null;
  }
}
