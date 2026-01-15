// /src/admin/assets/js/modules/code.js
import {
  ensureStore,
  getPaymentCode,
  setPaymentCode
} from './store.js';

let leftTimer;
let dayWatcherTimer;

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);

  requestAnimationFrame(() => t.classList.add('show'));

  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 200);
  }, 3000);
}


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

  ensureStore(storeId);

  const t = today();
  let pc = getPaymentCode(storeId);

  if (!pc || pc.date !== t) {
    pc = {
      date: t,
      code: generateCode(),
      updatedAt: Date.now()
    };
    setPaymentCode(storeId, pc);
  }

  document.getElementById('code-date').textContent = pc.date;
  document.getElementById('code-input').value = pc.code;

  if (leftTimer) clearInterval(leftTimer);
  tickLeft();
  watchMidnight();
}

/* ------------------------------
   자정 감시 (결제코드 자동 갱신)
------------------------------ */
function watchMidnight() {
  let lastDate = today();

  if (dayWatcherTimer) clearInterval(dayWatcherTimer);

  dayWatcherTimer = setInterval(() => {
    const nowDate = today();
    if (nowDate !== lastDate) {
      lastDate = nowDate;
      console.log('[CODE] date changed, re-render');
      renderCode(); // ✅ 핵심
      if (typeof showToast === 'function') {
        showToast('자정이 되어 결제코드가 갱신되었습니다');
      }
    }
  }, 60 * 1000); // 10초 간격 (부담 없음)
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
