// /src/admin/assets/js/modules/notify.js
// 매장별 알림 설정 + 소리 + 데스크탑 알림 + 알림로그 기록

import { get, patch, fmt } from './store.js';

// ---------------------------------------------
// 현재 storeId (프로젝트 전체에서 통일된 방식)
// ---------------------------------------------
function resolveStoreId() {
  if (window.qrnrStoreId) return window.qrnrStoreId;

  try {
    const u = new URL(location.href);
    const s = u.searchParams.get('store');
    if (s) {
      localStorage.setItem('qrnr.storeId', s);
      return s;
    }
  } catch (e) {}

  try {
    const saved = localStorage.getItem('qrnr.storeId');
    if (saved) return saved;
  } catch (e) {}

  return 'store1';
}

// 매장별 알림 설정 저장 경로
const PATH = () => ['admin', 'notify', resolveStoreId()];

// ---------------------------------------------
// 설정 로드/저장
// ---------------------------------------------
function loadNotifyConfig() {
  const raw = get(PATH()) || {};
  return {
    useBeep: raw.useBeep !== false,
    beepVolume:
      typeof raw.beepVolume === 'number' ? raw.beepVolume : 0.7,
    desktop: !!raw.desktop,
    webhookUrl: raw.webhookUrl || '',
  };
}

function saveNotifyConfig(updater) {
  patch(PATH(), (cur = {}) => {
    const base = {
      useBeep: true,
      beepVolume: 0.7,
      desktop: false,
      webhookUrl: '',
      ...cur,
    };
    return updater(base) || base;
  });
}

// ---------------------------------------------
// Web Audio 비프음
// ---------------------------------------------
let audioCtx = null;
let lastBeepAt = 0;
const BEEP_COOLDOWN_MS = 3000;

function playBeep(volume = 0.7) {
  const now = Date.now();
  if (now - lastBeepAt < BEEP_COOLDOWN_MS) return;
  lastBeepAt = now;

  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    if (!audioCtx) {
      audioCtx = new AC();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = volume;

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
  } catch (e) {
    console.error('[notify] beep error', e);
  }
}

// ---------------------------------------------
// 데스크탑 알림
// ---------------------------------------------
let lastDesktopAt = 0;
const DESKTOP_COOLDOWN_MS = 3000;

async function showDesktopNotification(title, body) {
  const now = Date.now();
  if (now - lastDesktopAt < DESKTOP_COOLDOWN_MS) return;
  lastDesktopAt = now;

  if (!('Notification' in window)) return;

  if (Notification.permission === 'denied') return;

  if (Notification.permission === 'default') {
    try {
      const p = await Notification.requestPermission();
      if (p !== 'granted') return;
    } catch (e) {
      console.error('[notify] request error', e);
      return;
    }
  }

  try {
    new Notification(title, {
      body,
      tag: 'qrnr-admin',
      renotify: true,
    });
  } catch (e) {
    console.error('[notify] notification error', e);
  }
}

// ---------------------------------------------
// 관리자 설정 UI
// ---------------------------------------------
export function renderNotify() {
  const n = loadNotifyConfig();

  const beepEl    = document.getElementById('n-beep');
  const volEl     = document.getElementById('n-vol');
  const desktopEl = document.getElementById('n-desktop');
  const hookEl    = document.getElementById('n-webhook');

  if (beepEl)    beepEl.checked    = !!n.useBeep;
  if (volEl)     volEl.value       = n.beepVolume ?? 0.7;
  if (desktopEl) desktopEl.checked = !!n.desktop;
  if (hookEl)    hookEl.value      = n.webhookUrl || "";
}

export function bindNotify() {
  const saveBtn = document.getElementById('n-save');
  if (!saveBtn) return;

  saveBtn.onclick = async () => {
    const useBeep = document.getElementById('n-beep')?.checked || false;
    const volRaw  = document.getElementById('n-vol')?.value;
    const vol     = isNaN(Number(volRaw)) ? 0.7 : Number(volRaw);
    const desktop = document.getElementById('n-desktop')?.checked || false;
    const webhook = (document.getElementById('n-webhook')?.value || '').trim();

    saveNotifyConfig(() => ({
      useBeep,
      beepVolume: vol,
      desktop,
      webhookUrl: webhook,
    }));

    if (desktop && 'Notification' in window) {
      if (Notification.permission === 'default') {
        try {
          await Notification.requestPermission();
        } catch (e) {}
      }
    }

    alert('저장되었습니다.');
  };
}

// ---------------------------------------------
// ⭐ 알림 이벤트 처리 + 알림 로그 저장(매장별)
// ---------------------------------------------
export function notifyEvent(msg) {
  if (!msg || !msg.type) return;

  const storeId = resolveStoreId();
  const cfg = loadNotifyConfig();

  let title = '';
  let body  = '';

  const isCall =
    msg.type === 'CALL';

  const isPaid =
    msg.type === 'NEW_ORDER_PAID' || msg.type === 'NEW_ORDER';

  if (!isCall && !isPaid) return;

  // -------------------------
  // 직원 호출 이벤트
  // -------------------------
  if (isCall) {
    title = '직원 호출';
    const table = msg.table || '-';
    const note  = msg.note || msg.message || '';
    body = `테이블 ${table}${note ? ' - ' + note : ''}`;

    // ⭐ 호출 이벤트 -> notifyLogs[storeId] 저장
    patch(['admin','notifyLogs',storeId], (list=[]) => {
      const arr = Array.isArray(list) ? [...list] : [];
      arr.push({
        id: 'call-' + Date.now(),
        ts: Date.now(),
        table,
        message: note,
        status: '대기',
        storeId,
      });
      return arr;
    });
  }

  // -------------------------
  // 주문 이벤트
  // -------------------------
  else if (isPaid) {
    let orderType = msg.orderType;

    if (!orderType) {
      const hasTable = !!msg.table;
      const hasCustomer = !!msg.customer;
      const hasReserve = !!(msg.customer && msg.reserveDate);

      if (hasTable && !hasCustomer) orderType = 'store';
      else if (hasReserve) orderType = 'reserve';
      else if (hasCustomer) orderType = 'delivery';
    }

    let itemsText = '';
    if (Array.isArray(msg.cart) && msg.cart.length) {
      itemsText = msg.cart.map(i => `${i.name}x${i.qty}`).join(', ');
    }

    if (orderType === 'store') {
      title = '매장 주문 완료';
      body = `테이블 ${msg.table}`;
    } else if (orderType === 'delivery') {
      title = '배달 주문 완료';
      body = `${msg.customer?.name || '-'}`;
    } else if (orderType === 'reserve') {
      title = '예약 주문 완료';
      body = `${msg.customer?.name || '-'}`;
    } else {
      title = '새 주문 결제 완료';
      body = `주문번호 ${msg.orderId || '-'}`;
    }
  }

  // 소리
  if (cfg.useBeep) playBeep(cfg.beepVolume ?? 0.7);

  // 데스크탑 알림
  if (cfg.desktop) showDesktopNotification(title, body);
}
