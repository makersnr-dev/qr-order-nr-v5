// /src/admin/assets/js/modules/notify.js
// 매장별 알림 설정 + 소리 + 데스크탑 알림 모듈

import { get, patch, fmt } from './store.js';

// ─────────────────────────────
// 공통: 현재 storeId
// ─────────────────────────────
function currentStoreId() {
  if (window.qrnrStoreId) return window.qrnrStoreId;
  try {
    const u = new URL(location.href);
    return u.searchParams.get('store') || 'store1';
  } catch (e) {
    return 'store1';
  }
}

// 매장별 알림 설정 경로: ['admin', 'notify', storeId]
const PATH = () => ['admin', 'notify', currentStoreId()];

// ─────────────────────────────
// 설정 로드/저장
// ─────────────────────────────
function loadNotifyConfig() {
  const raw = get(PATH()) || {};
  return {
    useBeep: raw.useBeep !== false,                       // 기본 true
    beepVolume:
      typeof raw.beepVolume === 'number' ? raw.beepVolume : 0.7,
    desktop: !!raw.desktop,                               // 기본 false
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
    const next = updater(base) || base;
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
    return;
  }
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
    osc.frequency.value = 880; // A5 음
    gain.gain.value = volume;

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
  } catch (e) {
    console.error('[notify] beep error', e);
  }
}

// ─────────────────────────────
// 데스크탑 알림 (Notification API, 쿨타임 포함)
// ─────────────────────────────
let lastDesktopAt = 0;
const DESKTOP_COOLDOWN_MS = 3000; // 3초에 한 번

async function showDesktopNotification(title, body) {
  const now = Date.now();
  if (now - lastDesktopAt < DESKTOP_COOLDOWN_MS) {
    return;
  }
  lastDesktopAt = now;

  if (!('Notification' in window)) return;

  if (Notification.permission === 'denied') {
    return;
  }
  if (Notification.permission === 'default') {
    try {
      const p = await Notification.requestPermission();
      if (p !== 'granted') return;
    } catch (e) {
      console.error('[notify] permission error', e);
      return;
    }
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

    const cfg = {
      useBeep,
      beepVolume: vol,
      desktop,
      webhookUrl: webhook,
    };

    saveNotifyConfig(() => cfg);

    // 데스크탑 알림 켰으면 권한 요청
    if (desktop && 'Notification' in window) {
      if (Notification.permission === 'default') {
        try {
          await Notification.requestPermission();
        } catch (e) {
          console.error('[notify] permission request error', e);
        }
      }
    }

    alert('저장되었습니다.');
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
    msg.type === 'CALL';
  const isPaid =
    msg.type === 'NEW_ORDER_PAID' || msg.type === 'NEW_ORDER';

  if (!isCall && !isPaid) return;

  let title = '';
  let body  = '';

  if (isCall) {
    // 직원 호출
    title = '직원 호출';
    const table = msg.table || '-';
    const note  = msg.note || msg.message || '';
    body = `테이블 ${table}${note ? ' - ' + note : ''}`;
  } else if (isPaid) {
    // ── 주문 알림 ─────────────────────
    // 1) 주문 타입 결정: orderType이 없으면 필드 보고 추론
    let orderType = msg.orderType || '';

    if (!orderType) {
      const hasTable    = !!msg.table;
      const hasCustomer = !!msg.customer;
      const hasReserve  = !!(msg.customer && msg.reserveDate);

      if (hasTable && !hasCustomer) {
        orderType = 'store';
      } else if (hasReserve) {
        orderType = 'reserve';
      } else if (hasCustomer) {
        orderType = 'delivery';
      }
    }

    // 2) 공통: 주문내역 텍스트 만들기
    let itemsText = '';
    if (Array.isArray(msg.cart) && msg.cart.length) {
      itemsText = msg.cart
        .map((i) => `${i.name} x${i.qty}`)
        .join(', ');
    } else if (msg.orderName) {
      itemsText = msg.orderName;
    }

    // 3) 타입별 제목/내용
    if (orderType === 'store') {
      // ✅ 매장 주문
      title = '매장 주문 완료';
      const table = msg.table || '-';
      body = `테이블 ${table}${itemsText ? ' · ' + itemsText : ''}`;
    } else if (orderType === 'delivery') {
      // ✅ 배달 주문
      title = '배달 주문 완료';
      const name =
        (msg.customer && msg.customer.name) ||
        msg.customerName ||
        '-';
      body = `${name}${itemsText ? ' · ' + itemsText : ''}`;
    } else if (orderType === 'reserve') {
      // ✅ 예약 주문
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
          ? fmt(msg.amount) + '원'
          : '';
      body = `주문번호 ${orderId}${amount ? ' / ' + amount : ''}`;
    }
  }

  // 소리
  if (cfg.useBeep) {
    playBeep(cfg.beepVolume ?? 0.7);
  }

  // 데스크탑 알림
  if (cfg.desktop) {
    showDesktopNotification(title, body);
  }
}
