import { get, patch } from './store.js';

function fmtDateTime(ts) {
  const d = ts ? new Date(ts) : new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  const HH   = String(d.getHours()).padStart(2, '0');
  const MM   = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${HH}:${MM}`;
}

const $ = (s, r=document) => r.querySelector(s);

export function renderNotifyLogs() {
  const tbody = $('#tbody-notify-logs');
  if (!tbody) return;

  const currentStoreId = window.qrnrStoreId || 'store1';
  const all = get(['admin', 'notifyLogs']) || [];

  // 현재 매장 로그만 필터 (과거 storeId 없는 데이터는 공통으로 표시)
  const list = all.filter(n => !n.storeId || n.storeId === currentStoreId);

  tbody.innerHTML = '';

  if (!list.length) {
    tbody.innerHTML =
      '<tr><td colspan="4" class="small">알림 없음</td></tr>';
    return;
  }

  list.forEach((n) => {
    const d = n.ts ? new Date(n.ts) : null;
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
          <option value="대기" ${status === '대기' ? 'selected' : ''}>대기</option>
          <option value="완료" ${status === '완료' ? 'selected' : ''}>완료</option>
        </select>
      </td>
    `;
    tbody.appendChild(tr);
  });
}


/**
 * 상태 드롭다운 변경 핸들러
 * - select[data-call-status] 변경 시 notifyLogs 배열에서 해당 id 찾아 status 업데이트
 */
export function bindNotifyLogs() {
  const tbody = $('#tbody-notify-logs');
  if (!tbody) return;

  // 1) 상태 드롭다운 변경 → notifyLogs 배열 상태 업데이트
  tbody.addEventListener('change', (e) => {
    const target = e.target;
    if (!target || target.tagName !== 'SELECT' || !target.dataset.callId) return;

    const id = target.dataset.callId;
    const nextStatus = target.value === '완료' ? '완료' : '대기';

    patch(['admin', 'notifyLogs'], (list) => {
      const arr = Array.isArray(list) ? [...list] : [];
      const idx = arr.findIndex((n) => String(n.id) === String(id));
      if (idx === -1) return arr;
      arr[idx] = {
        ...arr[idx],
        status: nextStatus,
      };
      return arr;
    });
  });

  // 2) 새로고침 버튼 → 현재 매장 기준으로 다시 그리기
  const refreshBtn = document.getElementById('notify-log-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      renderNotifyLogs();
    });
  }
}

