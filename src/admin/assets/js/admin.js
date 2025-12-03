// /src/admin/assets/js/admin.js
//------------------------------------------------------------
// 관리자 페이지 메인 스크립트 (storeId 안정화)
//------------------------------------------------------------

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

//------------------------------------------------------------
// storeId 우선순위:
// 1) URL ?store=
// 2) storeAdmins 매핑
// 3) localStorage.qrnr.storeId
// 4) fallback "store1"
//------------------------------------------------------------
function resolveStoreId(adminId) {
  // 1) URL
  try {
    const u = new URL(location.href);
    const urlStore = u.searchParams.get('store');

    if (urlStore) {
      const sid = String(urlStore);
      localStorage.setItem('qrnr.storeId', sid);
      console.log('[admin] storeId from ?store=', sid);
      return sid;
    }
  } catch (e) {
    console.error('[admin] URL parse error:', e);
  }

  // 2) 매핑
  try {
    const map = get(['system', 'storeAdmins']) || {};
    const mapped = map[adminId];

    // 문자열 저장 형태
    if (typeof mapped === 'string') {
      const sid = String(mapped);
      console.log('[admin] storeId from mapping-string:', sid);
      localStorage.setItem('qrnr.storeId', sid);
      return sid;
    }

    // 객체 저장 형태
    if (mapped && typeof mapped === 'object') {
      const sid =
        mapped.storeId ||
        mapped.store ||
        mapped.storeCode ||
        mapped.store_id ||
        null;

      if (sid) {
        const sid2 = String(sid);
        console.log('[admin] storeId from mapping-object:', sid2);
        localStorage.setItem('qrnr.storeId', sid2);
        return sid2;
      }
    }
  } catch (e) {
    console.error('[admin] mapping read error:', e);
  }

  // 3) localStorage fallback
  try {
    const stored = localStorage.getItem('qrnr.storeId');
    if (stored) {
      const sid = String(stored);
      console.log('[admin] storeId from localStorage:', sid);
      return sid;
    }
  } catch {}

  // 4) 최종 fallback
  return 'store1';
}

//------------------------------------------------------------
// 메인 실행
//------------------------------------------------------------
async function main() {
  // 인증
  const session = await requireAuth('admin');
  if (!session) return;

  const adminId =
    session.uid ||
    session.sub ||
    (session.user && (session.user.uid || session.user.id)) ||
    null;

  // storeId 결정
  const sid = resolveStoreId(adminId);
  localStorage.setItem('qrnr.storeId', sid);
  window.qrnrStoreId = sid;

  // URL에 자동 적용
  try {
    const u = new URL(location.href);
    if (!u.searchParams.get('store')) {
      u.searchParams.set('store', sid);
      history.replaceState(null, '', u.toString());
    }
  } catch {}

  // 서버와 동기화
  await syncStoreFromServer();
  initTabs();

  // 초기 렌더링
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
