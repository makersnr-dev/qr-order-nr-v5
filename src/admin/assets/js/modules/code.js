// /src/admin/assets/js/modules/code.js
import { get, patch } from './store.js';

let leftTimer;
let dayWatcherTimer;

/* ------------------------------
   공통 유틸
------------------------------ */
function today() {
  return new Date().toISOString().slice(0, 10);
}

function generateCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/* ------------------------------
   자정까지 남은 시간 표시
------------------------------ */
function tickLeft() {
  function left() {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    const ms = end - now;
    const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
    const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');

    const el = document.getElementById('code-left');
    if (el) {
      el.textContent = `(자정까지 ${h}시간 ${m}분)`;
    }
  }

  left();
  leftTimer = setInterval(left, 30000);
}

/* ------------------------------
   결제 코드 렌더링 (핵심)
------------------------------ */
export function renderCode() {
  const storeId = window.qrnrStoreId;
  if (!storeId) return;

  const t = today();
  let pc = get(['stores', storeId, 'paymentCode']);

  if (!pc || pc.date !== t) {
    pc = {
      date: t,
      code: generateCode(),
      updatedAt: Date.now()
    };
    patch(['stores', storeId, 'paymentCode'], () => pc);
  }

  document.getElementById('code-date').textContent = pc.date;
  document.getElementById('code-input').value = pc.code;

  if (leftTimer) clearInterval(leftTimer);
  tickLeft();

  if (!dayWatcherTimer) {
    let last = t;
    dayWatcherTimer = setInterval(() => {
      if (today() !== last) {
        last = today();
        renderCode();
      }
    }, 60000);
  }
}


/* ------------------------------
   버튼 바인딩
------------------------------ */
export function bindCode() {
  const storeId = () => window.qrnrStoreId;

  // 📋 복사
  const copyBtn = document.getElementById('code-copy');
  if (copyBtn) {
    copyBtn.onclick = () => {
      const v = document.getElementById('code-input')?.value;
      if (v) navigator.clipboard.writeText(v);
    };
  }

  // 🔁 새 코드 발급
  const newBtn = document.getElementById('code-new');
  if (newBtn) {
    newBtn.onclick = () => {
      const sid = storeId();
      if (!sid) return;

      patch(['stores', sid, 'paymentCode'], () => ({
        date: today(),
        code: generateCode(),
        updatedAt: Date.now()
      }));


      renderCode();
    };
  }

  // ♻ 기본 코드로 초기화
  const resetBtn = document.getElementById('code-reset');
  if (resetBtn) {
    resetBtn.onclick = () => {
      const sid = storeId();
      if (!sid) return;

      patch(['stores', sid, 'paymentCode'], () => ({
        date: today(),
        code: '7111',
        updatedAt: Date.now()
      }));


      renderCode();
    };
  }
}
