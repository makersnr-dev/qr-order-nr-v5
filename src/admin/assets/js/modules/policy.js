// /src/admin/assets/js/modules/policy.js
import { get, patch } from './store.js';

// ======================================================================
// storeId 결정 (admin.js, orders.js, menu.js 등과 동일한 규칙)
// ======================================================================
function resolveStoreId() {
  // 1) admin.js에서 설정한 전역 값
  if (typeof window !== 'undefined' && window.qrnrStoreId) {
    return window.qrnrStoreId;
  }

  // 2) URL 파라미터
  try {
    const u = new URL(location.href);
    const s = u.searchParams.get('store');
    if (s) {
      localStorage.setItem('qrnr.storeId', s);
      return s;
    }
  } catch (e) {}

  // 3) localStorage
  try {
    const saved = localStorage.getItem('qrnr.storeId');
    if (saved) return saved;
  } catch (e) {}

  // 4) 기본값
  return 'store1';
}

// ======================================================================
// 기본 개인정보처리방침 (공통)
// ======================================================================
const DEFAULT_POLICY_TEXT = `
[개인정보 처리방침]

QR 주문·배달/예약 서비스(이하 "서비스")는 ...
(중략 - 너가 작성한 원문 그대로 유지)
...
※ 본 예시는 일반적인 매장 QR 주문·배달/예약 서비스 상황을 기준으로 작성된 예시이며,
  실제 사업자의 형태, 서비스 구조, 법률 자문 결과 등에 따라
  일부 수정·보완이 필요할 수 있습니다.
`.trim();

// ======================================================================
// 화면 렌더링
// ======================================================================
export function renderPolicy() {
  const textarea = document.getElementById('privacy-text');
  if (!textarea) return;

  const storeId = resolveStoreId();

  // 매장별 정책 → 공통 정책 순으로 조회
  const saved =
    get(['admin', 'privacyPolicy', storeId]) ||
    get(['admin', 'privacyPolicy']) ||
    '';

  textarea.value = saved || DEFAULT_POLICY_TEXT;
}

// ======================================================================
// 버튼 바인딩 (저장 / 기본예시 채우기)
// ======================================================================
export function bindPolicy() {
  const textarea = document.getElementById('privacy-text');
  const saveBtn = document.getElementById('privacy-save');
  const resetBtn = document.getElementById('privacy-reset');

  if (!textarea || !saveBtn || !resetBtn) return;

  const storeId = resolveStoreId();

  // 저장
  saveBtn.onclick = () => {
    const text = (textarea.value || '').trim() || DEFAULT_POLICY_TEXT;

    // 매장별 저장
    patch(['admin', 'privacyPolicy', storeId], () => text);

    alert('개인정보 처리방침이 저장되었습니다.\n배달/예약 주문페이지에도 이 내용이 적용됩니다.');
  };

  // 기본 예시 채우기
  resetBtn.onclick = () => {
    const ok = confirm('기본 예시 내용을 불러올까요?\n(저장은 따로 눌러야 적용됩니다.)');
    if (!ok) return;
    textarea.value = DEFAULT_POLICY_TEXT;
  };
}

// ======================================================================
// 기본 텍스트 가져오기
// ======================================================================
export function getDefaultPolicyText() {
  return DEFAULT_POLICY_TEXT;
}
