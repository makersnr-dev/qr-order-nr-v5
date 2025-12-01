// /src/admin/assets/js/modules/paymentCode.js
import { get, patch } from './store.js';

let leftTimer = null;

// ------------------------------
// storeId 통일 규칙
// ------------------------------
function resolveStoreId() {
  if (window.qrnrStoreId) return window.qrnrStoreId;

  try {
    const u = new URL(location.href);
    const s = u.searchParams.get('store');
    if (s) {
      localStorage.setItem('qrnr.storeId', s);
      return s;
    }
  } catch(e){}

  try {
    const saved = localStorage.getItem('qrnr.storeId');
    if (saved) return saved;
  } catch(e){}

  return 'store1';
}

// ------------------------------
// 자정까지 남은 시간 표시
// ------------------------------
function tickLeft() {
  function left() {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    const ms = end - now;
    const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
    const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');

    const span = document.getElementById('code-left');
    if (span) span.textContent = `(자정까지 ${h}시간 ${m}분)`;
  }

  left();
  leftTimer = setInterval(left, 30000);
}

// ------------------------------
// 매장별 결제코드 로딩
// 자동 갱신(오늘 날짜 다르면 새코드 생성)
// ------------------------------
function loadPaymentCode() {
  const storeId = resolveStoreId();

  let pc = get(['admin', 'paymentCode', storeId]);

  const today = new Date().toISOString().slice(0,10);

  // 처음이거나 날짜가 오늘보다 이전이면 자동 생성
  if (!pc || pc.date !== today) {
    const newCode = String(Math.floor(1000 + Math.random() * 9000));
    pc = { date: today, code: newCode };

    patch(['admin','paymentCode', storeId], () => pc);
  }

  return pc;
}

// ------------------------------
// 화면 렌더
// ------------------------------
export function renderCode() {
  const storeId = resolveStoreId();
  const pc = loadPaymentCode();

  const d = document.getElementById('code-date');
  const i = document.getElementById('code-input');

  if (d) d.textContent = pc.date;
  if (i) i.value = pc.code;

  if (leftTimer) clearInterval(leftTimer);
  tickLeft();
}

// ------------------------------
// 버튼 바인딩
// ------------------------------
export function bindCode() {
  const storeId = resolveStoreId();

  // 복사
  const copyBtn = document.getElementById('code-copy');
  if (copyBtn) {
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(
        document.getElementById('code-input').value
      );
    };
  }

  // 새 코드 생성
  const newBtn = document.getElementById('code-new');
  if (newBtn) {
    newBtn.onclick = () => {
      const today = new Date().toISOString().slice(0,10);
      const newCode = String(Math.floor(1000 + Math.random() * 9000));

      patch(['admin','paymentCode', storeId], () => ({
        date: today,
        code: newCode
      }));

      renderCode();
    };
  }

  // 기본값(고정값) 7111로 리셋
  const resetBtn = document.getElementById('code-reset');
  if (resetBtn) {
    resetBtn.onclick = () => {
      const today = new Date().toISOString().slice(0,10);

      patch(['admin','paymentCode', storeId], () => ({
        date: today,
        code: '7111'
      }));

      renderCode();
    };
  }
}
