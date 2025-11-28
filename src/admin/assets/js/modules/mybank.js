import { get, patch } from './store.js';

function currentStoreId() {
  if (window.qrnrStoreId) return window.qrnrStoreId;
  try {
    const saved = localStorage.getItem('qrnr.storeId');
    if (saved) return saved;
  } catch (e) {
    console.error('[mybank] currentStoreId localStorage error', e);
  }
  return 'store1';
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
  if (acctInput)   acctInput.value   = b.acct   || '';
  if (holderInput) holderInput.value = b.holder || '';

  if (currentSpan) {
    if (b.bank || b.acct || b.holder) {
      currentSpan.textContent =
        `은행: ${b.bank || '-'} | 계좌: ${b.acct || '-'} | 예금주: ${b.holder || '-'}`;
    } else {
      currentSpan.textContent = '저장된 계좌 정보 없음';
    }
  }
}

export function bindMyBank() {
  const form   = document.getElementById('mb-form');
  const copyBtn = document.getElementById('mb-copy');
  const storeSpan = document.getElementById('mb-store-id');

  if (storeSpan) {
    storeSpan.textContent = currentStoreId();
  }

  if (form) {
    form.onsubmit = (e) => {
      e.preventDefault();
      const bankInput   = document.getElementById('mb-bank');
      const acctInput   = document.getElementById('mb-acct');
      const holderInput = document.getElementById('mb-holder');

      const next = {
        bank:   bankInput?.value.trim()   || '',
        acct:   acctInput?.value.trim()   || '',
        holder: holderInput?.value.trim() || '',
      };

      patch(PATH(), () => next);
      alert('입금 계좌 정보가 저장되었습니다.');
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
