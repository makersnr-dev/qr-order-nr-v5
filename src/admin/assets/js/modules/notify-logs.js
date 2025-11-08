import { get } from './store.js';
const $ = (s, r=document) => r.querySelector(s);

export function renderNotifyLogs() {
  const list = get(['admin', 'notifyLogs']) || [];
  const tbody = $('#tbody-notify-logs');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!list.length) {
    tbody.innerHTML =
      '<tr><td colspan="4" class="small">알림 없음</td></tr>';
    return;
  }

  list.forEach((n) => {
    const d = n.ts ? new Date(n.ts) : null;
    const time = d
      ? d.toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${time}</td>
      <td>${n.table || '-'}</td>
      <td>${n.message || ''}</td>
      <td>${n.status || '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}
