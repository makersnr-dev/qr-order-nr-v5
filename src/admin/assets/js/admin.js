//------------------------------------------------------------
// 관리자 페이지 메인 스크립트 (storeId 안정화 + SUPER/ADMIN 통합 대응)
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
// resolveStoreId(adminId) — 완전 안정화 버전
//------------------------------------------------------------
function resolveStoreId(adminId) {

  // 1) URL 파라미터
  try {
    const u = new URL(location.href);
    const urlRaw = u.searchParams.get("store");

    const urlStore = normalizeStoreId(urlRaw);
    if (urlStore) {
      localStorage.setItem("qrnr.storeId", urlStore);
      console.log("[admin] storeId from URL:", urlStore);
      return urlStore;
    }
  } catch (e) {
    console.error("[admin] URL parse error:", e);
  }

  // 2) storeAdmins 매핑
  try {
    const map = get(["system", "storeAdmins"]) || {};
    const raw = map[adminId];

    const mapped = normalizeStoreId(raw);
    if (mapped) {
      console.log("[admin] storeId from mapping:", mapped);
      localStorage.setItem("qrnr.storeId", mapped);
      return mapped;
    }
  } catch (e) {
    console.error("[admin] mapping read error:", e);
  }

  // 3) localStorage
  try {
    const storedRaw = localStorage.getItem("qrnr.storeId");
    const stored = normalizeStoreId(storedRaw);

    if (stored) {
      console.log("[admin] storeId from localStorage:", stored);
      return stored;
    }
  } catch (e) {
    console.error("[admin] localStorage error:", e);
  }

  // 4) fallback
  console.log("[admin] fallback storeId = store1");
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

function showToast(msg, variant = "info") {
  const box = ensureToastContainer();
  const el = document.createElement("div");

  el.textContent = msg;
  el.style.padding = "10px 14px";
  el.style.borderRadius = "6px";
  el.style.color = "#fff";
  el.style.fontSize = "13px";
  el.style.boxShadow = "0 2px 6px rgba(0,0,0,0.15)";
  el.style.opacity = "0.95";

  el.style.background =
    variant === "error"
      ? "#ff4d4f"
      : variant === "success"
      ? "#52c41a"
      : "#333";

  box.appendChild(el);

  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 2500);
}

//------------------------------------------------------------
// 3. BroadcastChannel
//------------------------------------------------------------
const adminChannel = new BroadcastChannel("qrnr-admin");

//------------------------------------------------------------
// 4. main()
//------------------------------------------------------------
async function main() {

  //------------------------------------------------------------------
  // A. 인증 검사
  //------------------------------------------------------------------
  const session = await requireAuth("admin");
  if (!session) return;

  const adminId =
    session.uid ||
    session.sub ||
    (session.user && (session.user.uid || session.user.id)) ||
    null;

  console.log("[admin] verified:", session);
  console.log("[admin] adminId:", adminId);

  //------------------------------------------------------------------
  // B. storeId 결정 + URL 반영
  //------------------------------------------------------------------
  const sid = resolveStoreId(adminId);
  window.qrnrStoreId = sid;
  localStorage.setItem("qrnr.storeId", sid);

  // URL 자동 보정
  try {
    const u = new URL(location.href);
    if (u.searchParams.get("store") !== sid) {
      u.searchParams.set("store", sid);
      history.replaceState(null, "", u.toString());
    }
  } catch (e) {
    console.error("[admin] URL update error:", e);
  }

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
      if (tab === "store") safeRenderStore();
      else if (tab === "delivery") safeRenderDeliv();
      else if (tab === "notify-log") safeRenderNotifyLogs();
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
  initQR();
  safeRenderNotifyLogs();
  bindNotifyLogs();

  renderPolicy();
  bindPolicy();

  //------------------------------------------------------------------
  // G. 실시간 이벤트 처리
  //------------------------------------------------------------------
  adminChannel.onmessage = (event) => {
    const msg = event.data;
    if (!msg || !msg.type) return;

    const currentId =
      window.qrnrStoreId || localStorage.getItem("qrnr.storeId");

    const msgId =
      msg.storeId ||
      msg.store ||
      msg.store_id ||
      msg.sid ||
      null;

    if (msgId && currentId && msgId !== currentId) {
      console.log("[admin] ignore other store:", msgId);
      return;
    }

    if (msg.type === "CALL") {
      showToast(
        `테이블 ${msg.table ?? "-"} 호출${msg.note ? " - " + msg.note : ""}`,
        "info"
      );
      notifyEvent(msg);
      safeRenderNotifyLogs();
    }


   if (msg.type === "NEW_ORDER") {
  showToast(
    `새 주문 도착 (테이블 ${msg.table || "-"})`,
    "success"
  );
  notifyEvent({
  ...msg,
  title: "새 주문 접수",
  body: `테이블 ${msg.table} 주문이 들어왔습니다`
});
  safeRenderStore();   // 매장 주문 새로고침
  safeRenderDeliv();
}

    
    if (msg.type === "NEW_ORDER_PAID") {
      showToast(`주문 결제 완료 - ${msg.orderId || ""}`, "success");
      notifyEvent(msg);
      safeRenderStore();
      safeRenderDeliv();
    }
  };
}

main();
