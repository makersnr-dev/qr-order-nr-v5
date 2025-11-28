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

  let currentStoreId = 'store1';
  if (window.qrnrStoreId) {
    currentStoreId = window.qrnrStoreId;
  } else {
    try {
      const saved = localStorage.getItem('qrnr.storeId');
      if (saved) currentStoreId = saved;
    } catch (e) {
      console.error('[notify-logs] currentStoreId localStorage error', e);
    }
  }

  const all = get(['admin', 'notifyLogs']) || [];

  // 현재 매장 로그만 필터 (과거 storeId 없는 데이터는 공통으로 표시)
  const list = all.filter(n => !n.storeId || n.storeId === currentStoreId);

  tbody.innerHTML = '';

  if (!list.length) {
    tbody.innerHTML =
      '<tr><td colspan="4" class="small">알림 없음</td></tr>';
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

  const clearBtn = document.getElementById('notify-log-clear');
  if (clearBtn) {
    clearBtn.onclick = () => {
      const ok = confirm('현재 매장 알림 로그를 모두 삭제할까요?');
      if (!ok) return;

      patch(['admin', 'notifyLogs'], (prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        return arr.filter(n => n.storeId && n.storeId !== currentStoreId);
      });

      renderNotifyLogs();
    };
  }

  const markReadBtn = document.getElementById('notify-log-mark-read');
  if (markReadBtn) {
    markReadBtn.onclick = () => {
      patch(['admin', 'notifyLogs'], (prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        return arr.map((n) => {
          if (!n.storeId || n.storeId !== currentStoreId) return n;
          return { ...n, status: 'read' };
        });
      });
      renderNotifyLogs();
    };
  }

  const refreshBtn = document.getElementById('notify-log-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      renderNotifyLogs();
    });
  }
}
