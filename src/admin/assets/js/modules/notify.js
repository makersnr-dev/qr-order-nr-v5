// /src/admin/assets/js/modules/notify.js
// 매장별 알림 설정 + 소리 + 데스크탑 알림 모듈

import {
  getNotifyConfig,
  setNotifyConfig,
  getCallOptions,
  setCallOptions,
  addNotifyLog,
  fmt
} from './store.js';


// ─────────────────────────────
// 공통: 현재 storeId
// ─────────────────────────────
function currentStoreId() {
  if (!window.qrnrStoreId) {
    alert('매장 정보가 초기화되지 않았습니다.\n관리자 콘솔로 다시 진입해주세요.');
    throw new Error('STORE_ID_NOT_INITIALIZED');
  }
  return window.qrnrStoreId;
}

// ─────────────────────────────
// 설정 로드/저장
// ─────────────────────────────
function loadNotifyConfig() {
  const storeId = currentStoreId();
  const raw = getNotifyConfig(storeId) || {};

  return {
    useBeep: raw.useBeep !== false,
    beepVolume:
      typeof raw.beepVolume === 'number' ? raw.beepVolume : 0.7,
    desktop: !!raw.desktop,
    webhookUrl: raw.webhookUrl || '',
  };
}

function saveNotifyConfig(cfg) {
  const storeId = currentStoreId();
  setNotifyConfig(storeId, cfg);
}

// ─────────────────────────────
// Web Audio 기반 비프음
// ─────────────────────────────
let audioCtx = null;
let lastBeepAt = 0;
const BEEP_COOLDOWN_MS = 3000;

export function enableNotifySound() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    if (!audioCtx) {
      audioCtx = new AC();
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  } catch (e) {
    console.error('[notify] enable sound error', e);
  }
}

function playBeep(volume = 0.7) {
  const now = Date.now();
  if (now - lastBeepAt < BEEP_COOLDOWN_MS) return;
  lastBeepAt = now;

  try {
    if (!audioCtx || audioCtx.state !== 'running') return;

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

// ─────────────────────────────
// 데스크탑 알림
// ─────────────────────────────
let lastDesktopAt = 0;
const DESKTOP_COOLDOWN_MS = 3000;

async function showDesktopNotification(title, body) {
  const now = Date.now();
  if (now - lastDesktopAt < DESKTOP_COOLDOWN_MS) return;
  lastDesktopAt = now;

  if (!('Notification' in window)) return;

  if (Notification.permission === 'denied') return;

  if (Notification.permission === 'default') {
    const p = await Notification.requestPermission();
    if (p !== 'granted') return;
  }

  new Notification(title, {
    body,
    tag: 'qrnr-admin',
    renotify: true,
  });
}

// ─────────────────────────────
// 관리자 알림 패널
// ─────────────────────────────
export function renderNotify() {
  const n = loadNotifyConfig();

  const beepEl    = document.getElementById('n-beep');
  const volEl     = document.getElementById('n-vol');
  const desktopEl = document.getElementById('n-desktop');
  const hookEl    = document.getElementById('n-webhook');

  if (beepEl)    beepEl.checked    = !!n.useBeep;
  if (volEl)     volEl.value       = n.beepVolume;
  if (desktopEl) desktopEl.checked = !!n.desktop;
  if (hookEl)    hookEl.value      = n.webhookUrl;
}

// ── 직원 호출 항목 렌더링 ──
export function renderCallOptions() {
  const box = document.getElementById('call-options-box');
  if (!box) return;

  const storeId = currentStoreId();
  const list = getCallOptions(storeId);

  box.innerHTML = list.map((opt, i) => `
    <div style="display:flex;gap:6px;margin-bottom:6px">
      <input class="input" value="${opt}" data-idx="${i}" />
      <button class="btn danger" data-del="${i}">삭제</button>
    </div>
  `).join('');

  box.innerHTML += `
    <button id="call-opt-add" class="btn small">항목 추가</button>
  `;
}

// ─────────────────────────────
// 바인딩
// ─────────────────────────────
export function bindNotify() {
  const saveBtn = document.getElementById('n-save');
  if (!saveBtn) return;

  saveBtn.onclick = async () => {
    const cfg = {
      useBeep: document.getElementById('n-beep')?.checked || false,
      beepVolume: Number(document.getElementById('n-vol')?.value) || 0.7,
      desktop: document.getElementById('n-desktop')?.checked || false,
      webhookUrl: (document.getElementById('n-webhook')?.value || '').trim(),
    };

    saveNotifyConfig(cfg);
    alert('저장되었습니다.');
  };
}

export function bindCallOptions() {
  const box = document.getElementById('call-options-box');
  if (!box) return;

  const storeId = currentStoreId();

  box.addEventListener('click', (e) => {
    if (e.target.dataset.del !== undefined) {
      const idx = Number(e.target.dataset.del);
      const list = getCallOptions(storeId);
      list.splice(idx, 1);
      setCallOptions(storeId, list);
      renderCallOptions();
    }

    if (e.target.id === 'call-opt-add') {
      const list = getCallOptions(storeId);
      list.push('새 호출 항목');
      setCallOptions(storeId, list);
      renderCallOptions();
    }
  });

  box.addEventListener('change', (e) => {
    const idx = e.target.dataset.idx;
    if (idx === undefined) return;

    const list = getCallOptions(storeId);
    list[idx] = e.target.value.trim() || list[idx];
    setCallOptions(storeId, list);
  });
}

// ─────────────────────────────
// 이벤트 수신 → 알림 트리거
// ─────────────────────────────
export function notifyEvent(msg) {
  if (!msg || !msg.type) return;

  const cfg = loadNotifyConfig();

  let title = '';
  let body  = '';

  if (msg.type === 'CALL') {
    title = '직원 호출';
    body = `테이블 ${msg.table || '-'}`;
  } else {
    title = '새 주문';
    body = msg.amount ? fmt(msg.amount) + '원' : '';
  }

  if (cfg.useBeep) {
    playBeep(cfg.beepVolume);
  }

  if (cfg.desktop) {
    showDesktopNotification(title, body);
  }

  if (msg.type === 'CALL') {
    addNotifyLog(currentStoreId(), {
      id: msg.id || 'CALL-' + Date.now(),
      storeId: currentStoreId(),
      table: msg.table || null,
      message: msg.note || '직원 호출',
      status: '대기',
      ts: msg.ts || Date.now(),
    });
  }
}
