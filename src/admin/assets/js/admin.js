// /src/admin/assets/js/admin.js
import { renderPolicy, bindPolicy } from './modules/policy.js';
import { requireAuth, clearToken } from './modules/auth.js';
import { initTabs } from './modules/ui.js';
import {
  renderStore,
  renderDeliv,
  bindFilters,
  exportOrders,
  attachGlobalHandlers,
  syncStoreFromServer,
} from './modules/orders.js';

import { initQR } from './modules/qr.js';
import { renderMenu, bindMenu } from './modules/menu.js';
import { renderCode, bindCode } from './modules/code.js';
import { renderMyBank, bindMyBank } from './modules/mybank.js';
import { renderNotify, bindNotify, notifyEvent } from './modules/notify.js';
import { renderNotifyLogs, bindNotifyLogs } from './modules/notify-logs.js';

import { get } from './modules/store.js';

async function main() {
  const session = await requireAuth('admin');
  if (!session) return;

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      // 🔥 auth_token 쿠키 삭제
      await fetch('/api/logout-admin', { method: 'POST' });

      // 🔥 localStorage 토큰 삭제
      clearToken();

      location.href = '/admin/login';
    };
  }

  await syncStoreFromServer();
  initTabs();
  bindFilters();
  renderStore();
  renderDeliv();
  attachGlobalHandlers();

  renderMenu();
  bindMenu();
  renderCode();
  bindCode();
  renderMyBank();
  bindMyBank();
  renderNotify();
  bindNotify();
  initQR();

  renderNotifyLogs();
  bindNotifyLogs();
  renderPolicy();
  bindPolicy();
}

main();
