// /src/admin/assets/js/modules/notify.js
// 매장별 알림 설정 + 소리 + 데스크탑 알림 모듈

import { get, patch, fmt } from './store.js';

// ─────────────────────────────
// 공통: 현재 storeId
// ─────────────────────────────
function currentStoreId() {
  // admin.js 에서 로그인 시점에 세팅해 둔 값 우선
  if (window.qrnrStoreId) return window.qrnrStoreId;

  // 혹시 모를 초기 상황 대비용 (보안상 민감 데이터는 아님: 알림 설정만 해당)
  try {
    const saved = localStorage.getItem('qrnr.storeId');
    if (saved) return saved;
  } catch (e) {
    console.error('[notify] currentStoreId localStorage error', e);
  }

  return 'store1';
}

// 매장별 알림 설정 경로: ['admin', 'notify', storeId]
const PATH = () => ['admin', 'notify', currentStoreId()];

// ─────────────────────────────
// 설정 로드/저장
// ─────────────────────────────
function loadNotifyConfig() {
  const raw = get(PATH()) || {};
  return {
    useBeep: raw.useBeep !== false, // 기본 true
    beepVolume:
      typeof raw.beepVolume === 'number' ? raw.beepVolume : 0.7,
    desktop: !!raw.desktop, // 기본 false
    webhookUrl: raw.webhookUrl || '',
  };
}

function saveNotifyConfig(updater) {
  patch(PATH(), (cur = {}) => {
    const base = {
      useBeep: cur.useBeep !== false,
      beepVolume:
        typeof cur.beepVolume === 'number' ? cur.beepVolume : 0.7,
      desktop: !!cur.desktop,
      webhookUrl: cur.webhookUrl || '',
    };
    const next =
      typeof updater === 'function' ? updater(base) || base : base;
    return next;
  });
}

// ─────────────────────────────
// Web Audio 기반 비프음 (쿨타임 포함)
// ─────────────────────────────
let audioCtx = null;
let lastBeepAt = 0;
const BEEP_COOLDOWN_MS = 3000; // 3초에 한 번만

function playBeep(volume = 0.7) {
  const now = Date.now();
  if (now - lastBeepAt < BEEP_COOLDOWN_MS) {
    // 너무 자주 울리면 귀 아프니까 쿨타임
    return;
  }
  lastBeepAt = now;

  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
    }
    const ctx = audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.value = 880;
    gain.gain.value = volume;

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();

    setTimeout(() => {
      try {
        osc.stop();
      } catch {}
    }, 200);
  } catch (e) {
    console.error('[notify] beep error', e);
  }
}

// ─────────────────────────────
// 데스크탑 알림
// ─────────────────────────────
async function ensureNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'default') return false;

  try {
    const p = await Notification.requestPermission();
    return p === 'granted';
  } catch (e) {
    console.error('[notify] permission error', e);
    return false;
  }
}

async function showDesktopNotification(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    const ok = await ensureNotificationPermission();
    if (!ok) return;
  } else if (Notification.permission !== 'granted') {
    return;
  }

  try {
    new Notification(title, {
      body,
      tag: 'qrnr-admin', // 동일 tag이면 묶어서 표시
      renotify: true,
      // icon: '/favicon.ico', // 필요하면 아이콘 경로 추가
    });
  } catch (e) {
    console.error('[notify] notification error', e);
  }
}

// ─────────────────────────────
// 관리자 알림 패널(설정 UI)
// ─────────────────────────────
export function renderNotify() {
  const n = loadNotifyConfig();

  const beepEl    = document.getElementById('n-beep');
  const volEl     = document.getElementById('n-vol');
  const desktopEl = document.getElementById('n-desktop');
  const hookEl    = document.getElementById('n-webhook');

  if (beepEl)    beepEl.checked    = !!n.useBeep;
  if (volEl)     volEl.value       = n.beepVolume ?? 0.7;
  if (desktopEl) desktopEl.checked = !!n.desktop;
  if (hookEl)    hookEl.value      = n.webhookUrl || '';
}

export function bindNotify() {
  const saveBtn = document.getElementById('n-save');
  if (!saveBtn) return;

  saveBtn.onclick = (e) => {
    e.preventDefault();

    const beepEl    = document.getElementById('n-beep');
    const volEl     = document.getElementById('n-vol');
    const desktopEl = document.getElementById('n-desktop');
    const hookEl    = document.getElementById('n-webhook');

    const useBeep   = !!(beepEl && beepEl.checked);
    const vol       = volEl ? Number(volEl.value || 0.7) : 0.7;
    const desktop   = !!(desktopEl && desktopEl.checked);
    const webhookUrl = hookEl ? (hookEl.value || '') : '';

    saveNotifyConfig((cur) => ({
      ...cur,
      useBeep,
      beepVolume: isFinite(vol) ? vol : 0.7,
      desktop,
      webhookUrl,
    }));

    alert('알림 설정이 저장되었습니다.');
  };
}

// ─────────────────────────────
// 관리자 이벤트 → 알림/소리 트리거
// (admin.js의 BroadcastChannel.onmessage 에서 호출)
// ─────────────────────────────
export function notifyEvent(msg) {
  if (!msg || !msg.type) return;

  const cfg = loadNotifyConfig();

  const isCall =
    msg.type === 'CALL' ||
    msg.type === 'call' ||
    msg.kind === 'call';

  const isPaid =
    msg.type === 'NEW_ORDER_PAID' ||
    msg.type === 'payment-success' ||
    msg.type === 'PAID' ||
    msg.kind === 'paid';

  let title = '';
  let body  = '';

  if (isCall) {
    // 직원 호출
    title = '직원 호출';
    const table = msg.table || msg.tableNo || '-';
    const note  = msg.note || msg.message || '';
    body = `테이블 ${table}${note ? ' - ' + note : ''}`;
  } else if (isPaid) {
    // ── 주문 알림 ─────────────────────
    // 1) 주문 타입 결정: orderType이 없으면 필드 보고 추론
    let orderType = msg.orderType || '';

    if (!orderType) {
      if (msg.delivery === true || msg.type === 'delivery') {
        orderType = 'delivery';
      } else if (msg.reserve === true || msg.type === 'reserve') {
        orderType = 'reserve';
      } else {
        orderType = 'store';
      }
    }

    // 2) 주문 내용 텍스트
    const items = msg.items || [];
    const itemsText = items
      .map((it) => {
        const name = it.name || it.menuName || it.menuId || '';
        const qty  = it.qty || it.quantity || 1;
        return `${name} x${qty}`;
      })
      .join(', ');

    if (orderType === 'store') {
      // 매장 주문
      title = '매장 주문 결제 완료';
      const table = msg.tableNo || msg.table || '-';
      body = `테이블 ${table}${itemsText ? ' · ' + itemsText : ''}`;
    } else if (orderType === 'delivery') {
      // 배달 주문
      title = '배달 주문 결제 완료';
      const name =
        (msg.customer && msg.customer.name) ||
        msg.customerName ||
        '-';
      body = `${name}${itemsText ? ' · ' + itemsText : ''}`;
    } else if (orderType === 'reserve') {
      // 예약 주문
      title = '예약 주문 완료';
      const name =
        (msg.customer && msg.customer.name) ||
        msg.customerName ||
        '-';
      body = `${name}${itemsText ? ' · ' + itemsText : ''}`;
    } else {
      // 정보 부족할 때 기존 형식으로 fallback
      title = '새 주문 결제 완료';
      const orderId = msg.orderId || '';
      const amount  =
        typeof msg.amount === 'number'
          ? fmt.number(msg.amount) + '원'
          : '';
      body = `주문번호 ${orderId}${amount ? ' / ' + amount : ''}`;
    }
  } else if (msg.type === 'NEW_ORDER') {
    // 결제 전 "새 주문" 이벤트를 따로 쓰고 싶을 때
    title = '새 주문이 접수되었습니다.';
    const table = msg.tableNo || msg.table || '';
    body = table ? `테이블 ${table}` : '';
  } else {
    // 기타 타입은 일단 무시
    return;
  }

  // 소리
  if (cfg.useBeep) {
    playBeep(cfg.beepVolume ?? 0.7);
  }

  // 데스크탑 알림
  if (cfg.desktop) {
    showDesktopNotification(title, body);
  }

  // webhookUrl 이 있으면, 나중에 필요하면 여기서 fetch 로 외부 훅 호출 가능
  // (지금은 실제 호출은 하지 않음. 무료 서버 부담 고려해서 주석 처리.)
  // if (cfg.webhookUrl) { ... }
}
