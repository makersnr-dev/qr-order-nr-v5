// /src/admin/assets/js/modules/notify-logs.js
import { get, patch } from './store.js';

const $ = (s, r=document) => r.querySelector(s);

// ------------------------------
// storeId 통일 함수
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
// 시간 포맷
// ------------------------------
function fmtDateTime(ts) {
  const d = ts ? new Date(ts) : new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2,'0');
  const dd   = String(d.getDate()).padStart(2,'0');
  const HH   = String(d.getHours()).padStart(2,'0');
  const MM   = String(d.getMinutes()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd} ${HH}:${MM}`;
}

// ------------------------------
// 렌더링
// ------------------------------
export function renderNotifyLogs() {
  const tbody = $('#tbody-notify-logs');
  if (!tbody) return;

  const storeId = resolveStoreId();

  // notifyLogs[storeId]가 기본 구조
  const all = get(['admin', 'notifyLogs', storeId]) || [];

  tbody.innerHTML = '';

  if (!all.length) {
    tbody.innerHTML =
      '<tr><td colspan="4" class="small">알림 없음</td></tr>';
    return;
  }

  all.forEach(n => {
    const time = fmtDateTime(n.ts);
    const status = n.status || '대기';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${time}</td>
      <td>${n.table || '-'}</td>
      <td>${n.message || ''}</td>
      <td>
        <select
          class="input"
          data-call-id="${n.id}"
          data-call-status
          style="width:90px"
        >
          <option value="대기"  ${status === '대기' ? 'selected' : ''}>대기</option>
          <option value="완료" ${status === '완료' ? 'selected' : ''}>완료</option>
        </select>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ------------------------------
// 이벤트 바인딩
// ------------------------------
export function bindNotifyLogs() {
  const tbody = $('#tbody-notify-logs');
  if (!tbody) return;

  const storeId = resolveStoreId();

  // 1) 상태 변경
  tbody.addEventListener('change', (e) => {
    const target = e.target;
    if (!target || target.tagName !== 'SELECT' || !target.dataset.callId)
      return;

    const id = target.dataset.callId;
    const nextStatus = target.value === '완료' ? '완료' : '대기';

    patch(['admin', 'notifyLogs', storeId], (list) => {
      const arr = Array.isArray(list) ? [...list] : [];
      const idx = arr.findIndex(n => String(n.id) === String(id));
      if (idx === -1) return arr;

      arr[idx] = {
        ...arr[idx],
        status: nextStatus,
      };
      return arr;
    });
  });

  // 2) 새로고침
  const refreshBtn = document.getElementById('notify-log-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      renderNotifyLogs();
    });
  }
}
