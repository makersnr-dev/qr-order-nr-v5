// /src/admin/assets/js/modules/notify.js
// 매장별 알림 설정 + 소리 + 데스크탑 알림 모듈

import { get, patch, fmt } from './store.js';

// ─────────────────────────────
// 공통: 현재 storeId
// ─────────────────────────────
function currentStoreId() {
  if (window.qrnrStoreId) return window.qrnrStoreId;
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
    useBeep: raw.useBeep !== false,
    beepVolume:
      typeof raw.beepVolume === 'number' ? raw.beepVolume : 0.7,
    desktop: !!raw.desktop,
  };
}

function saveNotifyConfig(cfg) {
  patch(PATH(), () => ({
    useBeep: cfg.useBeep,
    beepVolume: cfg.beepVolume,
    desktop: cfg.desktop,
  }));
}

// ─────────────────────────────
// 사운드 관련
// ─────────────────────────────
let audioCtx = null;
let beepOsc  = null;

function ensureAudioContext() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('[notify] AudioContext 생성 실패', e);
    }
  }
  return audioCtx;
}

function playBeep(volume = 0.7) {
  const ctx = ensureAudioContext();
  if (!ctx) return;

  if (beepOsc) {
    try {
      beepOsc.stop();
    } catch {}
    beepOsc = null;
  }

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
  }, 180);

  beepOsc = osc;
}

// ─────────────────────────────
// 데스크탑 알림
// ─────────────────────────────
let desktopEnabled = false;

export function initDesktopNotify() {
  const cfg = loadNotifyConfig();
  desktopEnabled = cfg.desktop;

  if (!('Notification' in window)) {
    console.log('[notify] Notification API 미지원');
    return;
  }

  if (Notification.permission === 'granted') {
    return;
  }

  if (Notification.permission === 'default') {
    Notification.requestPermission().then((perm) => {
      console.log('[notify] Notification permission:', perm);
    });
  }
}

function showDesktopNotification(title, body) {
  if (!desktopEnabled) return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const n = new Notification(title, {
    body,
    silent: false,
  });

  setTimeout(() => {
    n.close();
  }, 5000);
}

// ─────────────────────────────
// 새 이벤트가 들어왔을 때 (주문, 상태 변경 등)
// ─────────────────────────────
export function notifyEvent(ev) {
  const cfg = loadNotifyConfig();

  if (cfg.useBeep) {
    playBeep(cfg.beepVolume);
  }

  if (ev.type === 'order') {
    const title = '새 주문이 도착했습니다.';
    const body  = `[${ev.storeName || currentStoreId()}] ${ev.message || ''}`;
    showDesktopNotification(title, body);
  } else if (ev.type === 'payment-success') {
    const title = '결제가 완료되었습니다.';
    const body  = `[${ev.storeName || currentStoreId()}] 주문번호 ${ev.orderId || ''}`;
    showDesktopNotification(title, body);
  } else if (ev.type === 'status-change') {
    const title = '주문 상태가 변경되었습니다.';
    const body  = `[${ev.storeName || currentStoreId()}] ${ev.message || ''}`;
    showDesktopNotification(title, body);
  }
}

// ─────────────────────────────
// 설정 패널 바인딩
// ─────────────────────────────
export function bindNotifyControls() {
  const chkBeep      = document.getElementById('notify-use-beep');
  const rangeVolume  = document.getElementById('notify-beep-volume');
  const chkDesktop   = document.getElementById('notify-desktop');

  const cfg = loadNotifyConfig();

  if (chkBeep) {
    chkBeep.checked = cfg.useBeep;
  }
  if (rangeVolume) {
    rangeVolume.value = String(
      Math.round((cfg.beepVolume || 0.7) * 100)
    );
  }
  if (chkDesktop) {
    chkDesktop.checked = cfg.desktop;
  }

  if (chkBeep) {
    chkBeep.addEventListener('change', () => {
      const next = loadNotifyConfig();
      next.useBeep = !!chkBeep.checked;
      saveNotifyConfig(next);
    });
  }

  if (rangeVolume) {
    rangeVolume.addEventListener('input', () => {
      const v = Number(rangeVolume.value || '70');
      const next = loadNotifyConfig();
      next.beepVolume = Math.min(1, Math.max(0, v / 100));
      saveNotifyConfig(next);
    });
  }

  if (chkDesktop) {
    chkDesktop.addEventListener('change', () => {
      const next = loadNotifyConfig();
      next.desktop = !!chkDesktop.checked;
      saveNotifyConfig(next);
      desktopEnabled = next.desktop;
      if (next.desktop) {
        initDesktopNotify();
      }
    });
  }
}

// 필요시 초기화용
export function initNotify() {
  loadNotifyConfig();
}
