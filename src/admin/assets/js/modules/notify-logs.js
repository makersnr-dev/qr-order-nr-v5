// /src/admin/assets/js/modules/notify-logs.js
// 매장별 호출/알림 로그 표시 모듈

import { get, patch } from './store.js';

const $ = (s, r = document) => r.querySelector(s);

// 현재 매장 ID (URL ?store=는 신뢰하지 않음)
function currentStoreId() {
  if (window.qrnrStoreId) return window.qrnrStoreId;
  try {
    const saved = localStorage.getItem('qrnr.storeId');
    if (saved) return saved;
  } catch (e) {
    console.error('[notify-logs] currentStoreId localStorage error', e);
  }
  return 'store1';
}

function fmtDateTime(ts) {
  const d = ts ? new Date(ts) : new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  const HH   = String(d.getHours()).padStart(2, '0');
  const MM   = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${HH}:${MM}`;
}

// 호출/알림 로그 테이블 렌더링
export function renderNotifyLogs() {
  const tbody = $('#tbody-notify-logs');
  if (!tbody) return;

  const storeId = currentStoreId();
  const all = get(['admin', 'notifyLogs']) || [];

  // 현재 매장 로그만 표시 (storeId 없는 옛 로그는 공통으로 표시)
  const list = all.filter(
    (n) => !n.storeId || n.storeId === storeId
  );

  tbody.innerHTML = '';

  if (!list.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'small text-muted text-center';
    td.textContent = '알림 로그가 없습니다.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  for (const n of list) {
    const tr = document.createElement('tr');

    const tdTime = document.createElement('td');
    tdTime.textContent = fmtDateTime(n.ts);

    const tdKind = document.createElement('td');
    tdKind.textContent = n.kind || '-';

    const tdMsg = document.createElement('td');
    tdMsg.textContent = n.message || '';

    const tdStatus = document.createElement('td');
    tdStatus.textContent = n.status || '-';

    tr.appendChild(tdTime);
    tr.appendChild(tdKind);
    tr.appendChild(tdMsg);
    tr.appendChild(tdStatus);

    tbody.appendChild(tr);
  }
}

// 버튼/이벤트 바인딩 (clear, mark-read 등)
export function bindNotifyLogs() {
  const clearBtn = document.getElementById('notify-log-clear');
  const markReadBtn = document.getElementById('notify-log-mark-read');
  // refresh 버튼은 admin.js에서 safeRenderNotifyLogs 로 연결하므로 여기서는 건드리지 않음

  const storeId = currentStoreId();

  if (clearBtn) {
    clearBtn.onclick = () => {
      const ok = confirm('현재 매장 알림 로그를 모두 삭제할까요?');
      if (!ok) return;

      patch(['admin', 'notifyLogs'], (prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        // 다른 매장 로그는 그대로, 현재 매장 로그만 제거
        return arr.filter(
          (n) => n.storeId && n.storeId !== storeId
        );
      });

      renderNotifyLogs();
    };
  }

  if (markReadBtn) {
    markReadBtn.onclick = () => {
      patch(['admin', 'notifyLogs'], (prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        return arr.map((n) => {
          if (!n.storeId || n.storeId !== storeId) return n;
          return { ...n, status: 'read' };
        });
      });

      renderNotifyLogs();
    };
  }
}
