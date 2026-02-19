//------------------------------------------------------------
// 관리자 페이지 메인 스크립트 (storeId 안정화 + SUPER/ADMIN 통합 대응)
///src/admin/assets/js/admin.js
//------------------------------------------------------------

import { renderPolicy, bindPolicy } from './modules/policy.js';
import { requireAuth, clearToken } from './modules/auth.js';
import { initTabs } from './modules/ui.js';
import { supabaseMgr } from '/src/shared/supabase-manager.js';

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
import { renderDeliveryConfig, bindDeliveryAdmin } from './modules/delivery-admin.js';

//let supabaseClient = null; // 전역 변수 이름을 살짝 바꿈

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

  // 3. Fallback: 매장 정보가 전혀 없을 때
  console.error("❌ 매장 식별 정보가 없습니다.");
  showToast("매장 정보를 찾을 수 없습니다. 다시 로그인해 주세요.", "error");
  
  // [추가] 화면 클릭 방지 (안정성)
  document.body.style.pointerEvents = "none";
  document.body.style.opacity = "0.5";
    
  setTimeout(() => {
    location.href = "/admin/login?error=no_store";
  }, 2000);
    
  return null;
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
  const container = ensureToastContainer(); // 컨테이너 활용
  const t = document.createElement('div');
  t.className = `toast toast-${variant}`; 
  t.textContent = msg;
  
  container.appendChild(t); // body가 아닌 container에 삽입

  requestAnimationFrame(() => t.classList.add('show'));

  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 200);
  }, 3000);
}

//------------------------------------------------------------
// 3. BroadcastChannel
//------------------------------------------------------------
const adminChannel = new BroadcastChannel("qrnr-admin");
// --- [추가] 실제 데스크탑 알림 팝업 함수 ---
function showDesktopNotification(title, body) {
  if (!("Notification" in window)) return;

  if (Notification.permission === "granted") {
    try {
      // 팝업 생성
      const n = new Notification(title, {
        body: String(body), // 반드시 문자열 확인
        icon: location.origin + '/favicon.ico', // 절대 경로로 보정
        silent: true // 브라우저 자체 기본음은 끄고, 사장님의 mp3만 재생되도록 함
      });

      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch (e) {
      console.error("데스크탑 알림 생성 실패:", e);
    }
  }
}
let lastAlarmTime = 0;
let lastProcessedEventId= sessionStorage.getItem('qrnr.lastEventId');
async function initRealtimeAlarm(storeId) {
    // 1. 전역 클라이언트 확인 (window. 필수)
    if (!storeId) return;

    // [수정] 매니저로부터 채널 가져오기 (자동 클라이언트 생성 및 구독 포함)
    const realtimeChannel = await supabaseMgr.getChannel(storeId);
    if (!realtimeChannel) return;

    console.log(`📡 [관리자] 실시간 구독 시작 (매니저): ${storeId}`);

   realtimeChannel
  // --- [1] 새 주문 수신 (딩동 소리) ---
  .on('broadcast', { event: 'NEW_ORDER' }, (payload) => {
    const data = payload.payload;
    console.log("🔔 새 주문 발생!", data);
    
    const currentSid = window.qrnrStoreId;
    const eventId = data.orderNo || data.id;

    // ✅ [수정 1] 목록 갱신을 중복 방지(return) 로직보다 위로 올림
    // 이유: 알림은 한 번만 울려야 하지만, 목록은 어떤 탭에서든 갱신되어야 함
    // ✅ [수정 2] safeRender... 대신 원본 render... 함수를 직접 호출 (5초 쿨타임 무시)
    if (data.orderType === 'store' || data.type === 'store') {
        if (typeof renderStore === 'function') renderStore(currentSid); 
    } else {
        if (typeof renderDeliv === 'function') renderDeliv(currentSid);
    }

    // [중복 방지] 알림(소리/토스트)은 여기서부터 차단됨
    if (lastProcessedEventId === eventId) return;
    lastProcessedEventId = eventId;
    sessionStorage.setItem('qrnr.lastEventId', eventId);
    adminChannel.postMessage({ type: 'EVENT_PROCESSED', eventId });
    
    // 2. 소리 재생
    const now = Date.now();
    if (now - lastAlarmTime > 2000) {
        const audio = new Audio('/src/admin/assets/sound/dingdong.mp3');
        audio.play().catch(() => {
            console.log("🔊 화면을 클릭해야 소리가 재생됩니다.");
        });
        lastAlarmTime = now;
    }

    // 3. 토스트 알림 표시
    // ✅ [수정 3] data.type 도 함께 체크하도록 보정
    const orderTitle = (data.orderType === 'store' || data.type === 'store') ? '매장' : '예약';
    const cName = data.customerName || '비회원';
    showToast(`📦 새 ${orderTitle} 주문 도착! (${cName})`, "success");

    // 4. 데스크탑 팝업 알림
    showDesktopNotification(`🚨 새 ${orderTitle} 주문`, `${cName}님의 주문이 들어왔습니다.`);

    // [탭 깜빡임]
    const originalTitle = document.title;
    document.title = "🚨 [새 주문 발생] 🚨";
    setTimeout(() => { document.title = originalTitle; }, 3000);  })
      
     // --- [2] 직원 호출 수신 (call.mp3 소리) ---
    .on('broadcast', { event: 'NEW_CALL' }, (payload) => {
      // Supabase broadcast는 payload.payload 안에 실제 데이터가 들어있습니다.
      const data = payload.payload;
      console.log("🔔 실시간 호출 수신 데이터:", data);
      const currentSid = window.qrnrStoreId;
      
      const eventId = data.id || data.orderId || ('call-' + Date.now());
        // [중복 방지] 다른 탭에서 이미 처리된 이벤트인지 확인
        if (lastProcessedEventId === eventId) return;
        lastProcessedEventId = eventId;
        adminChannel.postMessage({ type: 'EVENT_PROCESSED', eventId });
      // 테이블 번호 추출 (data.table 또는 data.table_no 둘 다 대응)
      const tableNo = data.table_no || data.table || '??';
      const note = data.note || data.message || '직원 호출';

      // 🔊 중복 소리 방지 필터 (2초)
      const now = Date.now();
      if (now - lastAlarmTime > 2000) {
          const callAudio = new Audio('/src/admin/assets/sound/call.mp3'); 
          callAudio.play().catch(() => {});
          lastAlarmTime = now;
      }
  
     showToast(`🔔 [호출] ${tableNo}번 테이블: ${note}`, "info");
        showDesktopNotification(`🔔 직원 호출 (${tableNo}번)`, note);
        if (typeof safeRenderNotifyLogs === 'function') safeRenderNotifyLogs(currentSid);
      });

    // 상단 상태바 초록불 켜기
    updateStatusUI('CONNECTED');
}

function updateStatusUI(status) {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    if (!dot || !text) return;

    switch (status) {
        case 'CONNECTED':
            dot.style.backgroundColor = '#10b981'; // 녹색
            dot.style.boxShadow = '0 0 8px #10b981';
            text.textContent = '실시간 연결됨';
            break;
        case 'DISCONNECTED':
            dot.style.backgroundColor = '#ef4444'; // 빨간색
            dot.style.boxShadow = '0 0 8px #ef4444';
            text.textContent = '연결 끊김 (재시도 중)';
            break;
        default:
            dot.style.backgroundColor = '#ccc';
            text.textContent = '연결 중...';
    }
}

//------------------------------------------------------------
// 4. main()
//------------------------------------------------------------
async function main() {
  // 🔊 최초 클릭 시 사운드 활성화
  document.body.addEventListener('click', () => { enableNotifySound(); }, { once: true });
  
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
  const client = await supabaseMgr.getClient(); // ✅ 매니저를 통해 안전하게 클라이언트를 가져옴
if (client) {
  initRealtimeAlarm(sid); // 이제 안심하고 실행
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
        case "store": safeRenderStore(sid); break;
        case "delivery": safeRenderDeliv(sid); break;
        case "notify-log": safeRenderNotifyLogs(sid); break;
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
  safeRenderStore(sid);
  safeRenderDeliv(sid);
  attachGlobalHandlers();

  // -------------------------------------------------
// 주문 새로고침 버튼 바인딩 (누락돼 있던 부분)
// -------------------------------------------------
const storeRefreshBtn = document.getElementById("store-refresh");
if (storeRefreshBtn) {
  storeRefreshBtn.addEventListener("click", () => {
    safeRenderStore(sid);
  });
}

const delivRefreshBtn = document.getElementById("deliv-refresh");
if (delivRefreshBtn) {
  delivRefreshBtn.addEventListener("click", () => {
    safeRenderDeliv(sid);
  });
}


  const storeExportBtn = document.getElementById("store-export");
  if (storeExportBtn) storeExportBtn.onclick = () =>
    exportOrders("ordersStore");

  const delivExportBtn = document.getElementById("deliv-export");
  if (delivExportBtn) delivExportBtn.onclick = () =>
    exportOrders("ordersDelivery");

 renderMenu(sid);
  bindMenu(sid);
  renderCode(sid);
  bindCode(sid);
  renderMyBank(sid);
  bindMyBank(sid);
  renderNotify(sid);
  bindNotify(sid);
  renderCallOptions(sid);   
  bindCallOptions(sid);     
  renderDeliveryConfig(sid);
  bindDeliveryAdmin(sid);
  initQR(sid);
  safeRenderNotifyLogs(sid);
  bindNotifyLogs(sid);
  renderPolicy(sid);
  bindPolicy(sid);

 
//------------------------------------------------------------------
  // G. 실시간 이벤트 처리 (알림 중복 방지 수정)
  //------------------------------------------------------------------
  adminChannel.onmessage = null;
  adminChannel.onmessage = (event) => {
    const msg = event.data;
    if (!msg || !msg.type) return;
    if (msg.type === 'EVENT_PROCESSED') {
        lastProcessedEventId = msg.eventId; // 다른 탭이 처리했음을 기록
    }

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
      safeRenderNotifyLogs(sid);
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
