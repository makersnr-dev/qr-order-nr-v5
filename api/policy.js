// /api/policy.js
import fs from "fs/promises";
import { rateLimit } from "./_lib/rate-limit.js";

export const config = { runtime: "nodejs" };

const POLICY_FILE = "/tmp/qrnr_policy.json";

const DEFAULT_POLICY = `
[개인정보 처리방침]

1. 수집 항목: 이름, 연락처, 주소, 주문/예약 정보, 결제 관련 최소 정보 등
2. 이용 목적: 주문 및 배달·예약 서비스 제공, 결제 처리, 문의 응대 등
3. 보유 기간: 관련 법령에 따른 보관기간(최대 5년) 후 지체없이 파기
4. 제3자 제공: 법령에 따른 경우 또는 결제/호스팅/지도 서비스 제공 범위 내에서만 제공
5. 위탁: 결제(Toss Payments), 호스팅(Vercel), 주소 검색(카카오) 등
6. 이용자 권리: 열람·정정·삭제·처리정지 요구 가능
7. 문의처: 매장 운영자 연락처를 통해 문의 가능
`.trim();

function json(res, body, status = 200) {
  res.status(status).setHeader("content-type", "application/json");
  return res.send(JSON.stringify(body));
}

async function loadPolicy() {
  try {
    const txt = await fs.readFile(POLICY_FILE, "utf8");
    const parsed = JSON.parse(txt);
    return {
      text: parsed.text || DEFAULT_POLICY,
      updatedAt: parsed.updatedAt || null,
    };
  } catch (err) {
    if (err.code === "ENOENT") {
      return { text: DEFAULT_POLICY, updatedAt: null };
    }
    console.error("[policy] load error:", err);
    return { text: DEFAULT_POLICY, updatedAt: null };
  }
}

async function savePolicy(text) {
  const data = {
    text,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(POLICY_FILE, JSON.stringify(data, null, 2), "utf8");
  return data;
}

export default async function handler(req, res) {

  // POST는 Rate Limit 적용
  if (req.method === "POST") {
    const limit = rateLimit(req, "policy-write");
    if (!limit.ok) {
      return json(res, { ok: false, error: limit.reason }, 429);
    }
  }

  try {
    if (req.method === "GET") {
      const data = await loadPolicy();
      return json(res, { ok: true, policy: data });
    }

    if (req.method === "POST") {
      const text = (req.body?.text || "").trim();
      if (!text) return json(res, { ok: false, error: "EMPTY_TEXT" }, 400);

      const saved = await savePolicy(text);
      return json(res, { ok: true, policy: saved });
    }

    res.setHeader("Allow", "GET,POST");
    return json(res, { ok: false, error: "METHOD_NOT_ALLOWED" }, 405);

  } catch (err) {
    console.error("[policy] handler error:", err);
    return json(
      res,
      {
        ok: false,
        error: "INTERNAL_ERROR",
        detail: err?.message || String(err),
      },
      500
    );
  }
}
