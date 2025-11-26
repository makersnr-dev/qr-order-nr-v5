// /api/privacy.js
// 개인정보 처리방침 텍스트를 저장/조회하는 API
// /tmp/qrnr_privacy.json 파일에 저장 (orders.js와 같은 방식)

import fs from 'fs/promises';

const PRIVACY_FILE = '/tmp/qrnr_privacy.json';

// 기본 구조: { policies: [ { storeId, text, updatedAt }, ... ] }
async function loadPolicies() {
  try {
    const txt = await fs.readFile(PRIVACY_FILE, 'utf8');
    const parsed = JSON.parse(txt);
    if (parsed && Array.isArray(parsed.policies)) {
      return parsed.policies;
    }
    return [];
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      // 파일 없는 경우 = 아직 저장된 정책 없음
      return [];
    }
    console.error('[privacy] loadPolicies error:', err);
    return [];
  }
}

async function savePolicies(policies) {
  try {
    const data = {
      policies,
      savedAt: new Date().toISOString(),
    };
    await fs.writeFile(PRIVACY_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[privacy] savePolicies error:', err);
    throw err;
  }
}

// 기본 예시 텍스트 (전문적인 버전)
const DEFAULT_PRIVACY_TEXT = `
[개인정보 처리방침]

1. 총칙
본 매장은 고객님의 개인정보를 중요하게 여기며, 「개인정보 보호법」 및 관련 법령을 준수합니다.
본 개인정보 처리방침은 배달/예약 주문 서비스 이용과 관련하여 수집되는 개인정보의 처리 목적,
보유·이용 기간, 보호조치 등에 대해 안내하기 위한 것입니다.

2. 수집하는 개인정보의 항목
가. 필수 수집 항목
  - 주문자 성명
  - 연락처(휴대전화 번호 등)
  - 배송지 주소(배달 시)
  - 주문 내역 및 결제 관련 정보(결제 금액, 메뉴 구성 등)

나. 자동으로 생성·수집될 수 있는 정보
  - 서비스 이용 과정에서 생성되는 주문 기록
  - 접속 일시, 접속 IP 등 서비스 안정성 확보를 위해 필요한 최소한의 기술 정보

3. 개인정보의 수집·이용 목적
수집된 개인정보는 다음 목적을 위해 이용됩니다.
  1) 배달/예약 주문 접수, 확인 및 처리
  2) 배달 주소 확인 및 방문·배송 일정 안내
  3) 결제 및 환불 처리, 매출 관리 등 거래 관계의 이행
  4) 주문 관련 고객 문의 응대 및 민원 처리
  5) 서비스 이용 통계 및 품질 개선을 위한 분석(개인 식별이 불가능한 형태로 처리)

4. 개인정보의 보유 및 이용 기간
가. 원칙
  - 개인정보는 수집·이용 목적이 달성된 후에는 지체 없이 파기합니다.

나. 관련 법령에 따른 보관
  - 전자상거래 등에서의 소비자 보호에 관한 법률에 따라 다음 기간 동안 보관할 수 있습니다.
    · 계약 또는 청약철회 등에 관한 기록: 5년
    · 대금 결제 및 재화 등의 공급에 관한 기록: 5년
    · 소비자의 불만 또는 분쟁 처리에 관한 기록: 3년
  - 이 기간이 경과한 경우에는 지체 없이 안전한 방법으로 파기합니다.

5. 개인정보의 제3자 제공
가. 원칙
  - 본 매장은 고객님의 개인정보를 원칙적으로 제3자에게 제공하지 않습니다.

나. 예외
  - 고객님의 별도 동의가 있는 경우
  - 법령에 근거가 있거나, 수사기관·감독기관 등의 적법한 요구가 있는 경우
위와 같은 경우에만 최소한의 범위 내에서 제공될 수 있습니다.

6. 개인정보 처리의 위탁
  - 서비스 운영, 시스템 유지보수, 알림(문자/카카오톡 등) 발송을 위하여
    일부 업무를 외부 업체에 위탁할 수 있습니다.
  - 이 경우 위탁받는 자와 위탁 업무의 내용, 보호조치 등을 관련 법령에 따라 관리·감독합니다.

7. 이용자의 권리와 행사 방법
고객님은 언제든지 본인의 개인정보에 대하여 다음 권리를 행사하실 수 있습니다.
  1) 개인정보 열람을 요구할 권리
  2) 오류 등이 있을 경우 정정·삭제를 요구할 권리
  3) 처리 정지를 요구할 권리
관련 요청은 매장 운영자에게 직접 문의하시면 지체 없이 필요한 조치를 안내해 드립니다.
다만, 관련 법령에서 보관을 명시적으로 요구하는 정보에 대해서는 삭제 또는 처리 정지가
제한될 수 있습니다.

8. 개인정보의 파기 절차 및 방법
  1) 파기 절차
     - 보유 기간이 경과하거나 처리 목적이 달성된 개인정보는 내부 방침 및 관련 법령에 따라
       지체 없이 파기됩니다.
  2) 파기 방법
     - 전자적 파일 형태: 복구 및 재생이 불가능한 방법으로 영구 삭제
     - 종이 문서: 분쇄 또는 소각

9. 개인정보 보호를 위한 기술적·관리적 대책
본 매장은 고객님의 개인정보를 안전하게 보호하기 위해 다음과 같은 조치를 취합니다.
  1) 개인정보에 대한 접근 권한 최소화
  2) 비밀번호 및 주요 정보 암호화(해당되는 경우)
  3) 개인정보 취급 직원에 대한 교육 및 관리 감독
  4) 안전한 네트워크 환경 유지 및 보안 업데이트(해당되는 경우)

10. 개인정보 보호책임자 및 문의처
개인정보 처리와 관련된 문의, 열람·정정·삭제 요청, 권리 행사 등은
매장 운영자 또는 안내된 연락처를 통해 문의하실 수 있습니다.
접수된 문의에 대해서는 최대한 신속하고 성실하게 답변 드리겠습니다.

본 개인정보 처리방침은 매장의 정책 또는 관련 법령의 변경에 따라 개정될 수 있으며,
중요한 변경 사항이 있을 경우 합리적인 방법으로 고지합니다.
`.trim();

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return handleGet(req, res);
    }
    if (req.method === 'POST') {
      return handlePost(req, res);
    }

    res.setHeader('Allow', 'GET,POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  } catch (err) {
    console.error('[privacy] handler error:', err);
    return res.status(500).json({
      ok: false,
      error: 'INTERNAL_ERROR',
      detail: err?.message || String(err),
    });
  }
}

// GET /api/privacy?storeId=xxx
async function handleGet(req, res) {
  const { storeId } = req.query || {};
  const sid = typeof storeId === 'string' && storeId.trim() ? storeId.trim() : 'default';

  const policies = await loadPolicies();
  const found =
    policies.find(p => p.storeId === sid) ||
    policies.find(p => p.storeId === 'default');

  return res.status(200).json({
    ok: true,
    // 서버에서 기본 텍스트까지 같이 보내주면, 클라이언트는 이걸 그대로 쓸 수도 있음
    text: found?.text || DEFAULT_PRIVACY_TEXT,
    storeId: sid,
  });
}

// POST /api/privacy
// body: { storeId, text }
async function handlePost(req, res) {
  const body = req.body || {};
  const sidRaw = body.storeId;
  const textRaw = body.text;

  const sid = typeof sidRaw === 'string' && sidRaw.trim()
    ? sidRaw.trim()
    : 'default';

  const text = typeof textRaw === 'string' ? textRaw : '';

  if (!text.trim()) {
    return res.status(400).json({
      ok: false,
      error: 'EMPTY_TEXT',
    });
  }

  const policies = await loadPolicies();
  const now = new Date().toISOString();

  const idx = policies.findIndex(p => p.storeId === sid);
  if (idx >= 0) {
    policies[idx] = { storeId: sid, text, updatedAt: now };
  } else {
    policies.push({ storeId: sid, text, updatedAt: now });
  }

  await savePolicies(policies);

  return res.status(200).json({
    ok: true,
    storeId: sid,
    updatedAt: now,
  });
}
