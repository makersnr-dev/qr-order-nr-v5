// /src/admin/assets/js/modules/notify.js
import { showToast } from '../admin.js';
import { supabaseMgr } from '/src/shared/supabase-manager.js';
// ─────────────────────────────
// 설정 로드/저장 (DB 연동)
// ─────────────────────────────

// 화면에 설정값들을 뿌려주는 함수
export async function renderNotify(storeId) {
    const sid = storeId;
    try {
        const res = await fetch(`/api/store-settings?storeId=${sid}`);
        const settings = data.settings || {};
        const data = await res.json();
        const n = data.settings?.notify_config || { useBeep: true, beepVolume: 0.7, desktop: true };
        const bh = settings.business_hours || { enabled: false, start: "09:00", end: "22:00", days: [1,2,3,4,5] };

        if (document.getElementById('n-beep')) document.getElementById('n-beep').checked = !!n.useBeep;
        if (document.getElementById('n-vol')) document.getElementById('n-vol').value = n.beepVolume;
        if (document.getElementById('n-desktop')) document.getElementById('n-desktop').checked = !!n.desktop;
        if (document.getElementById('n-webhook')) document.getElementById('n-webhook').value = n.webhookUrl || '';

        document.getElementById('bh-enabled').checked = !!bh.enabled;
        document.getElementById('bh-start').value = bh.start;
        document.getElementById('bh-end').value = bh.end;
        document.querySelectorAll('#bh-days input').forEach(el => {el.checked = bh.days.includes(parseInt(el.value));});
    } catch (e) {
        console.error(e);
    }
}

// 호출 항목(물, 수저 등)을 그려주는 함수
export async function renderCallOptions(storeId) {
    const box = document.getElementById('call-options-box');
    if (!box) return;

    const sid = storeId;
    try {
        const res = await fetch(`/api/store-settings?storeId=${sid}`);
        const data = await res.json();
        const list = data.settings?.call_options || ['물/수저 요청', '테이블 정리', '주문 문의'];

        box.innerHTML = list.map((opt, i) => `
            <div style="display:flex;gap:6px;margin-bottom:6px">
                <input class="input call-opt-input" value="${opt}" data-idx="${i}" />
                <button class="btn danger" data-del="${i}">삭제</button>
            </div>
        `).join('');

        box.innerHTML += `<button id="call-opt-add" class="btn small">+ 항목 추가</button>`;
    } catch (e) {
        console.error(e);
    }
}

// ─────────────────────────────
// 바인딩 (저장 버튼 클릭 시)
// ─────────────────────────────
export function bindNotify(storeId) {
    const saveBtn = document.getElementById('n-save');
    if (!saveBtn) return;

    saveBtn.onclick = async () => {
        // [중복 클릭 방지] 로딩 상태 시작
        saveBtn.disabled = true;
        saveBtn.classList.add('btn-loading');
        const sid = storeId;

        const bhDays = Array.from(document.querySelectorAll('#bh-days input:checked')).map(el => parseInt(el.value));
        const businessHours = {
            enabled: document.getElementById('bh-enabled').checked,
            start: document.getElementById('bh-start').value,
            end: document.getElementById('bh-end').value,
            days: bhDays
        };
        
        const notifyConfig = {
            useBeep: document.getElementById('n-beep')?.checked,
            beepVolume: Number(document.getElementById('n-vol')?.value),
            desktop: document.getElementById('n-desktop')?.checked,
            webhookUrl: document.getElementById('n-webhook')?.value.trim(),
        };

        try {
        const res = await fetch(`/api/store-settings?storeId=${sid}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notifyConfig, businessHours })
        });

        if (res.ok) {
                showToast("✅ 알림 설정이 저장되었습니다.", "success");
                
                // [수정] 매니저를 사용하여 안전하고 간결하게 신호 발송
                const channel = await supabaseMgr.getChannel(sid);
                if (channel) {
                    await channel.send({
                        type: 'broadcast',
                        event: 'RELOAD_SIGNAL',
                        payload: { type: 'call_options_update', at: Date.now() }
                    });
                    console.log("📡 [설정] 손님 화면 업데이트 신호 전송 완료");
                }
            }
        } catch (e) {
            showToast("네트워크 오류 발생", "error");
        } finally {
            saveBtn.disabled = false;
            saveBtn.classList.remove('btn-loading');
        }
    };
}

export function bindCallOptions(storeId) {
    const box = document.getElementById('call-options-box');
    if (!box) return;

    // 추가/삭제 이벤트 (이 부분은 UI만 먼저 변경하고 나중에 한꺼번에 저장하는 게 편합니다)
    box.onclick = async (e) => {
        const sid = storeId;
        
        // 현재 입력된 모든 값들을 긁어모음
        const getCurrentList = () => Array.from(document.querySelectorAll('.call-opt-input')).map(input => input.value.trim());

        if (e.target.dataset.del !== undefined) {
            const list = getCurrentList();
            list.splice(Number(e.target.dataset.del), 1);
            await saveCallOptions(sid, list);
        }

        if (e.target.id === 'call-opt-add') {
            const list = getCurrentList();
            list.push('새 호출 항목');
            await saveCallOptions(sid, list);
        }
    };

    // 포커스 나갈 때 자동으로 저장
    box.onchange = async (e) => {
        if (e.target.classList.contains('call-opt-input')) {
            const sid = storeId;
            const list = Array.from(document.querySelectorAll('.call-opt-input')).map(input => input.value.trim());
            await saveCallOptions(sid, list);
        }
    };
}

async function saveCallOptions(sid, list) {
    const res = await fetch(`/api/store-settings?storeId=${sid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callOptions: list })
    });

    if (res.ok) {
        showToast("호출 항목 반영됨", "success");
        renderCallOptions(sid);

        // [수정] 매니저를 사용하여 실시간 신호 발송 로직 단축
        const channel = await supabaseMgr.getChannel(sid);
        if (channel) {
            await channel.send({
                type: 'broadcast',
                event: 'RELOAD_SIGNAL',
                payload: { type: 'call_options_update', at: Date.now() }
            });
            console.log("📡 [호출항목] 손님 화면 업데이트 신호 전송 완료");
        }
    }
}
// --- 소리 및 알림 로직 (기존 유지) ---
let audioCtx = null;
export function enableNotifySound() { /* 기존 동일 */ }
function playBeep(volume = 0.7) { /* 기존 동일 */ }
async function showDesktopNotification(title, body) { /* 기존 동일 */ }
export function notifyEvent(msg) { /* 기존 동일 */ }
