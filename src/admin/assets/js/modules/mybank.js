// /src/admin/assets/js/modules/mybank.js
// v5 다점포 구조 완전 대응 버전

import { get, patch, ensureStoreInitialized } from './store.js';

// 현재 storeId 가져오기 (admin.js에서 세팅됨)
function currentStoreId() {
  return (
    window.qrnrStoreId ||
    localStorage.getItem('qrnr.storeId') ||
    'store1'
  );
}

// PATH: ['admin', 'ownerBank', storeId]
const PATH = () => ['admin', 'ownerBank', currentStoreId()];

/**
 * 계좌 정보 렌더링
 */
export function renderMyBank() {
  const storeId = currentStoreId();
  ensureStoreInitialized(storeId);

  const b = get(PATH()) || {};

  const bankInput   = document.getElementById('mb-bank');
  const acctInput   = document.getElementById('mb-acct');
  const holderInput = document.getElementById('mb-holder');
  const currentSpan = document.getElementById('mb-current');

  if (bankInput)   bankInput.value   = b.bank   || '';
  if (acctInput)   acctInput.value   = b.number || '';
  if (holderInput) holderInput.value = b.holder || '';

  if (currentSpan) {
    if (b.bank && b.number && b.holder) {
      currentSpan.textContent = `${b.bank} ${b.number} (${b.holder})`;
    } else {
      currentSpan.textContent = '(저장된 정보 없음)';
    }
  }
}

/**
 * 저장 & 복사 버튼 바인딩
 */
export function bindMyBank() {
  const saveBtn = document.getElementById('mb-save');
  const copyBtn = document.getElementById('mb-copy');

  // ---- 저장 ----
  if (saveBtn) {
    saveBtn.onclick = () => {
      const bank   = (document.getElementById('mb-bank')?.value || '').trim();
      const number = (document.getElementById('mb-acct')?.value || '').trim();
      const holder = (document.getElementById('mb-holder')?.value || '').trim();

      if (!bank || !number || !holder) {
        alert('은행 / 계좌번호 / 예금주를 모두 입력해주세요.');
        return;
      }

      patch(PATH(), () => ({ bank, number, holder }));
      renderMyBank();
      alert('저장되었습니다.');
    };
  }

  // ---- 복사 ----
  if (copyBtn) {
    copyBtn.onclick = () => {
      const cur = document.getElementById('mb-current')?.textContent || '';

      if (!cur || cur.includes('저장된 정보 없음')) {
        alert('저장된 계좌 정보가 없습니다.');
        return;
      }

      navigator.clipboard
        .writeText(cur)
        .then(() => alert('복사되었습니다.'))
        .catch(() => alert('복사 실패. 브라우저 권한을 확인해주세요.'));
    };
  }
}
