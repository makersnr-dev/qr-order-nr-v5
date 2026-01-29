// /src/admin/assets/js/modules/policy.js
import {
  getPrivacyPolicy,
  setPrivacyPolicy
} from './store.js';

// ✅ 매장별 기본 개인정보 처리방침 (전문적/포멀 버전)
const DEFAULT_POLICY_TEXT = `
[개인정보 처리방침]

QR 주문·배달/예약 서비스(이하 "서비스")는 「개인정보 보호법」, 
「정보통신망 이용촉진 및 정보보호 등에 관한 법률」 등 관련 법령을 준수하며,
이용자의 개인정보를 안전하게 보호하기 위해 다음과 같이 개인정보 처리방침을 수립·운영합니다.

1. 수집하는 개인정보 항목
1) 필수 항목
  - 주문자 정보: 이름, 연락처(휴대전화 번호)
  - 배송/방문 정보: 주소(배달 시), 예약 일자 및 시간(예약 시)
  - 주문 정보: 주문 메뉴, 수량, 결제 금액, 주문 유형(매장/배달/예약) 등

2) 자동으로 생성·수집될 수 있는 정보
  - 서비스 이용 기록, 접속 일시, 브라우저 종류 등(로그 분석 및 보안 목적)

2. 개인정보의 수집·이용 목적
서비스는 수집한 개인정보를 다음의 목적 범위 내에서만 이용합니다.
  1) 주문 접수 및 처리, 배달/방문 예약 관리
  2) 주문 내역 확인 및 변경, 취소 등 고객 요청 처리
  3) 배달/방문 일정 안내, 주문 관련 고지·안내
  4) 민원 처리 및 분쟁 발생 시 사실 관계 확인
  5) 서비스 품질 향상 및 운영 관리(통계·분석 등, 개인 식별이 불가능한 형태로 처리)

3. 개인정보의 보유 및 이용 기간
서비스는 관련 법령에서 정한 기간 동안 개인정보를 보유·이용하며,
그 이후에는 지체 없이 안전한 방법으로 파기합니다.

1) 전자상거래 등에서의 소비자 보호에 관한 법률에 따른 보존 기간
  - 계약 또는 청약철회 등에 관한 기록: 5년
  - 대금 결제 및 재화 등의 공급에 관한 기록: 5년
  - 소비자의 불만 또는 분쟁 처리에 관한 기록: 3년

2) 기타 관련 법령에 따른 보존 기간
  - 관계 법령에 따라 추가 보관이 필요한 경우, 해당 법에서 정한 기간 동안 보관합니다.

4. 개인정보의 제3자 제공
서비스는 원칙적으로 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다.
다만, 다음의 경우에는 예외로 합니다.
  1) 이용자가 사전에 제3자 제공에 명시적으로 동의한 경우
  2) 법령에 근거가 있거나, 수사기관·감독기관 등의 적법한 요구가 있는 경우
  3) 기타 관련 법령에서 허용하는 경우

5. 개인정보 처리의 위탁
서비스는 주문 처리, 시스템 운영, 알림 발송 등 서비스 제공을 위하여
일부 업무를 외부 전문 업체에 위탁할 수 있습니다.
이 경우, 다음 사항을 포함하여 관계 법령에 따라 위탁 계약을 체결하고
수탁자가 개인정보를 안전하게 관리하도록 감독합니다.
  1) 위탁받는 자(수탁자)
  2) 위탁 업무의 내용
  3) 재위탁 제한, 안전성 확보 조치, 손해배상 책임 등

※ 실제 위탁을 진행하는 경우, 위탁 업체 명칭과 업무 내용을 별도 공지 또는 안내문을 통해 고지합니다.

6. 이용자 및 법정대리인의 권리와 행사 방법
이용자는 언제든지 자신의 개인정보에 대하여 다음 각 호의 권리를 행사할 수 있습니다.
  1) 개인정보 열람 요구
  2) 개인정보 정정·삭제 요구
  3) 개인정보 처리 정지 요구

7. 개인정보의 파기 절차 및 방법
서비스는 보유 기간이 경과하거나 처리 목적이 달성된 경우, 지체 없이 해당 정보를 파기합니다.

8. 개인정보의 안전성 확보 조치
서비스는 개인정보의 안전한 처리를 위하여 다음과 같은 보호 조치를 취합니다.
  1) 접근 권한 관리
  2) 보안 프로그램 사용
  3) 접속 기록 보관

9. 개인정보 보호 책임자
  - 개인정보 보호 책임자: 매장 운영자
  - 연락처: 매장 연락처
`.trim();

function currentStoreId() {
  const storeId = window.qrnrStoreId;
  if (!storeId) {
    alert('매장 정보가 초기화되지 않았습니다.\n관리자 콘솔로 다시 진입해주세요.');
    throw new Error('STORE_ID_NOT_INITIALIZED');
  }
  return storeId;
}

export function renderPolicy() {
  const textarea = document.getElementById('privacy-text');
  if (!textarea) return;

  const storeId = currentStoreId();
  const saved = getPrivacyPolicy(storeId);

  textarea.value = saved || DEFAULT_POLICY_TEXT;
}

export function bindPolicy() {
  const textarea = document.getElementById('privacy-text');
  const saveBtn = document.getElementById('privacy-save');
  const resetBtn = document.getElementById('privacy-reset');

  if (!textarea || !saveBtn || !resetBtn) return;

  const storeId = currentStoreId();

  saveBtn.onclick = () => {
    const text = (textarea.value || '').trim() || DEFAULT_POLICY_TEXT;
    setPrivacyPolicy(storeId, text);
    alert('개인정보 처리방침이 저장되었습니다.');
  };

  resetBtn.onclick = () => {
    const ok = confirm('기본 예시 내용으로 채울까요?');
    if (!ok) return;
    textarea.value = DEFAULT_POLICY_TEXT;
  };
}

export function getDefaultPolicyText() {
  return DEFAULT_POLICY_TEXT;
}
