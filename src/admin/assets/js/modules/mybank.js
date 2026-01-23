import { get, patch } from './store.js';

function currentStoreId() {
  if (!window.qrnrStoreId) {
    alert('매장 정보가 초기화되지 않았습니다.\n관리자 콘솔로 다시 진입해주세요.');
    throw new Error('STORE_ID_NOT_INITIALIZED');
  }
  return window.qrnrStoreId;
}


// 매장별 계좌 저장 위치: ['admin', 'ownerBank', storeId]
const PATH = () => ['admin', 'ownerBank', currentStoreId()];

export function renderMyBank() {
  const b = get(PATH()) || {};
  const bankInput   = document.getElementById('mb-bank');
  const acctInput   = document.getElementById('mb-acct');
  const holderInput = document.getElementById('mb-holder');
  const currentSpan = document.getElementById('mb-current');

  if (bankInput)   bankInput.value   = b.bank   || '';
  if (acctInput)   acctInput.value   = b.number || '';
  if (holderInput) holderInput.value = b.holder || '';

  if (currentSpan) {
    currentSpan.textContent =
      (b.bank && b.number && b.holder)
        ? `${b.bank} ${b.number} (${b.holder})`
        : '(저장된 정보 없음)';
  }
}

export function bindMyBank() {
  const saveBtn = document.getElementById('mb-save');
  const copyBtn = document.getElementById('mb-copy');

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
    };
  }

  if (copyBtn) {
    copyBtn.onclick = () => {
      const cur = document.getElementById('mb-current')?.textContent || '';
      if (!cur || cur.includes('저장된 정보 없음')) {
        alert('저장된 계좌 정보가 없습니다.');
        return;
      }
      navigator.clipboard.writeText(cur);
    };
  }
}
