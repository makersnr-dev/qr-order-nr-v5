//------------------------------------------------------------
// 관리자 페이지 메인 스크립트 (storeId 안정화 + SUPER/ADMIN 통합 대응)
///src/admin/assets/js/admin.js
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
import { renderNotify, bindNotify, notifyEvent,enableNotifySound,renderCallOptions,bindCallOptions } from './modules/notify.js';
import { renderNotifyLogs, bindNotifyLogs } from './modules/notify-logs.js';

import { get } from './modules/store.js';

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

let supabase = null;

//------------------------------------------------------------
// STORE ID NORMALIZER (핵심 버그 해결)
//------------------------------------------------------------
function normalizeStoreId(value) {
  if (!value) return null;

  // 1) 문자열이면 "[object Object]" 같은 잘못된 케이스를 제거
  if (typeof value === "string") {
    const trimmed = value.trim();

    // 문자열인데 잘못된 값인 경우 무효 처리
    if (trimmed === "[object Object]" || trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return null;
    }

    return trimmed;
  }

  // 2) 객체면 storeId 필드 추출
  if (typeof value === "object") {
    const sid =
      value.storeId ||
      value.store ||
      value.storeCode ||
      value.store_id ||
      null;

    return typeof sid === "string" ? sid : null;
  }

  return null;
}


//------------------------------------------------------------
// resolveStoreId(adminId) — DB 환경 최적화 버전
//------------------------------------------------------------
function resolveStoreId(adminId) {
  // 1) URL 파라미터가 최우선
  try {
    const u = new URL(location.href);
    const urlStore = normalizeStoreId(u.searchParams.get("store"));
    if (urlStore) {
      localStorage.setItem("qrnr.storeId", urlStore);
      return urlStore;
    }
  } catch (e) {}

  // 2) localStorage (이전에 저장된 값)
  const stored = normalizeStoreId(localStorage.getItem("qrnr.storeId"));
  if (stored) return stored;

  // 3) Fallback
  return "store1";
}

//------------------------------------------------------------
// 0. 데스크탑 알림 권한
//------------------------------------------------------------
if (typeof window !== "undefined" && "Notification" in window) {
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

//------------------------------------------------------------
// 1. refresh 폭탄 방지
//------------------------------------------------------------
const REFRESH_COOLDOWN_MS = 5000;

function makeSafeRefresher(realFn) {
  let last = 0;
  return async function (...args) {
    const now = Date.now();
    if (now - last < REFRESH_COOLDOWN_MS) {
      console.log("[safeRefresh] skip:", realFn.name);
      return;
    }
    last = now;
    try {
      return await realFn(...args);
    } catch (e) {
      console.error("[safeRefresh] error:", realFn.name, e);
    }
  };
}

const safeRenderStore = makeSafeRefresher(renderStore);
const safeRenderDeliv = makeSafeRefresher(renderDeliv);
const safeRenderNotifyLogs = makeSafeRefresher(renderNotifyLogs);

//------------------------------------------------------------
// 2. Toast UI
//------------------------------------------------------------
function ensureToastContainer() {
  let box = document.getElementById("admin-toast-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "admin-toast-box";
    box.style.position = "fixed";
    box.style.top = "16px";
    box.style.right = "16px";
    box.style.zIndex = "9999";
    box.style.display = "flex";
    box.style.flexDirection = "column";
    box.style.gap = "8px";
    document.body.appendChild(box);
  }
  return box;
}

// /src/admin/assets/js/admin.js

/**
 * 표준 토스트 알림 함수
 * @param {string} msg - 표시할 메시지
 * @param {string} variant - 'info', 'success', 'error' (색상 구분용)
 */
export function showToast(msg, variant = 'info') {
  const t = document.createElement('div');
  
  // 기본 클래스는 toast, 상태에 따라 클래스 추가 (예: toast-success)
  t.className = `toast toast-${variant}`; 
  t.textContent = msg;
  
  document.body.appendChild(t);

  // 브라우저가 요소를 인식한 직후에 'show' 클래스 추가 (애니메이션 시작)
  requestAnimationFrame(() => t.classList.add('show'));

  // 3초 후 사라짐
  setTimeout(() => {
    t.classList.remove('show');
    // 애니메이션(0.2초)이 끝난 후 요소 삭제
    setTimeout(() => t.remove(), 200);
  }, 3000);
}
//------------------------------------------------------------
// 3. BroadcastChannel
//------------------------------------------------------------
const adminChannel = new BroadcastChannel("qrnr-admin");
async function initRealtimeAlarm(storeId) {
    if (!supabase || !storeId) return;
    
    // 기존 구독이 남아있으면 꼬일 수 있으므로 깨끗하게 정리
    supabase.removeAllChannels();

    // 1. 새 주문 알람 채널 (띵동 소리 + 목록 갱신)
    const alarmChannel = supabase.channel(`qrnr_alarm_${storeId}`);
    alarmChannel.on('broadcast', { event: 'NEW_ORDER' }, (payload) => {
        const data = payload.payload;
        console.log("🔔 새 주문 도착!", data);

        // 음성 재생
        const audio = new Audio('/src/admin/assets/sound/dingdong.mp3');
        audio.play().catch(() => console.log("소리 재생을 위해 화면 클릭 필요"));

        // 목록 자동 새로고침
        if (data.orderType === 'store') safeRenderStore();
        else safeRenderDeliv();

        showToast(`📦 새 주문 도착! (${data.table}번)`, "success");
    }).subscribe();

    // 2. 상태 변경 동기화 채널 (주문완료/준비중 변경 시 자동 갱신)
    const syncChannel = supabase.channel(`qrnr_sync_${storeId}`);
    syncChannel.on('broadcast', { event: 'STATUS_CHANGED' }, (payload) => {
        const { orderId, status, type } = payload.payload;
        console.log(`🔄 상태 변경 동기화: ${orderId} -> ${status}`);
        
        // 목록 자동 새로고침
        if (type === 'store') safeRenderStore();
        else safeRenderDeliv();
        
        showToast(`🔄 주문 상태가 [${status}](으)로 업데이트되었습니다.`, 'info');
    }).subscribe();
}
//------------------------------------------------------------
// 4. main()
//------------------------------------------------------------


async function main() {
  // 🔊 최초 클릭 시 사운드 활성화
  document.body.addEventListener('click', () => { enableNotifySound(); }, { once: true });

  try {
    const res = await fetch('/api/config');
    const { supabaseUrl, supabaseKey } = await res.json();
    supabase = supabasejs.createClient(supabaseUrl, supabaseKey);
  } catch (e) {
    console.error("Supabase 설정 로드 실패:", e);
  }  
  
  // A. 인증 검사 (서버에서 storeId를 이미 받아옵니다)
  const session = await requireAuth("admin");
  if (!session) return;

  const adminId = session.uid || session.sub || 'admin';
  
  // 🔑 중요: 서버(api/me)가 준 storeId가 있다면 그걸 최우선으로 믿습니다.
  const sid = session.storeId || resolveStoreId(adminId);
  window.qrnrStoreId = sid;
  localStorage.setItem("qrnr.storeId", sid);
  sessionStorage.setItem('qrnr.adminId.real', adminId); // 이름 통일

  
  
  // [중요] 3. 로그인 성공 및 storeId 확정 후 알람 구독 시작
  if (supabase) {
  initRealtimeAlarm(sid);
  }

  // B. URL 보정
  try {
    const u = new URL(location.href);
    if (u.searchParams.get("store") !== sid) {
      u.searchParams.set("store", sid);
      history.replaceState(null, "", u.toString());
    }
  } catch (e) {}

  //------------------------------------------------------------------
  // C. 서버와 매장 데이터 동기화
  //------------------------------------------------------------------
  await syncStoreFromServer();
  initTabs();

  //------------------------------------------------------------------
  // D. 탭 전환
  //------------------------------------------------------------------
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      switch(tab) {
        case "store": safeRenderStore(); break;
        case "delivery": safeRenderDeliv(); break;
        case "notify-log": safeRenderNotifyLogs(); break;
      }
    });
  });

  //------------------------------------------------------------------
  // E. 로그아웃
  //------------------------------------------------------------------
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      clearToken();
      // super_token 도 제거
      document.cookie =
        "super_token=; Path=/; Max-Age=0; SameSite=Lax; Secure;";
      location.href = "/admin/login";
    };
  }

  //------------------------------------------------------------------
  // F. 기타 초기화
  //------------------------------------------------------------------
  bindFilters();
  safeRenderStore();
  safeRenderDeliv();
  attachGlobalHandlers();

  // -------------------------------------------------
// 주문 새로고침 버튼 바인딩 (누락돼 있던 부분)
// -------------------------------------------------
const storeRefreshBtn = document.getElementById("store-refresh");
if (storeRefreshBtn) {
  storeRefreshBtn.addEventListener("click", () => {
    safeRenderStore();
  });
}

const delivRefreshBtn = document.getElementById("deliv-refresh");
if (delivRefreshBtn) {
  delivRefreshBtn.addEventListener("click", () => {
    safeRenderDeliv();
  });
}


  const storeExportBtn = document.getElementById("store-export");
  if (storeExportBtn) storeExportBtn.onclick = () =>
    exportOrders("ordersStore");

  const delivExportBtn = document.getElementById("deliv-export");
  if (delivExportBtn) delivExportBtn.onclick = () =>
    exportOrders("ordersDelivery");

  renderMenu();
  bindMenu();
  renderCode();
  bindCode();
  renderMyBank();
  bindMyBank();
  renderNotify();
  bindNotify();
  renderCallOptions();   
  bindCallOptions();     
  initQR();
  safeRenderNotifyLogs();
  bindNotifyLogs();

  renderPolicy();
  bindPolicy();

 
//------------------------------------------------------------------
  // G. 실시간 이벤트 처리 (알림 중복 방지 수정)
  //------------------------------------------------------------------
  adminChannel.onmessage = (event) => {
    const msg = event.data;
    if (!msg || !msg.type) return;

    // 🔕 내가 보낸 이벤트는 무시 (adminId.real 로 이름 일치시킴)
    const myAdminId = sessionStorage.getItem('qrnr.adminId.real');
    if (msg.senderId && myAdminId && msg.senderId === myAdminId) return;

    // 🔒 매장 필터링
    const currentId = window.qrnrStoreId;
    const msgId = msg.storeId || msg.store || msg.sid;
    if (msgId && currentId && msgId !== currentId) return;

    const timeText = msg.at ? new Date(msg.at).toLocaleTimeString() : '';

    if (msg.type === 'CALL') {
      showToast(`🔔 테이블 ${msg.table ?? '-'} 호출${msg.note ? ' - ' + msg.note : ''} ${timeText}`, 'info');
      notifyEvent(msg);
      safeRenderNotifyLogs();
    } /*else if (msg.type === 'NEW_ORDER') {
      showToast(`📦 새 주문 도착 (${msg.table || '예약'}) ${timeText}`, 'success');
      notifyEvent(msg);
      if (msg.orderType === 'store') safeRenderStore();
      else safeRenderDeliv();
    } else if (msg.type === 'STATUS_CHANGED') {
      showToast('🔄 주문 상태가 업데이트되었습니다', 'info');
      safeRenderStore();
      safeRenderDeliv();
      
    }*/
  };
}

main();
