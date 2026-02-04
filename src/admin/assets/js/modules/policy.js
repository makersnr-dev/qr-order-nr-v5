// /src/admin/assets/js/modules/policy.js
import { showToast } from '../admin.js';

// 기본 예시 문구 (DB에 데이터가 없을 때 보여줄 용도)
const DEFAULT_POLICY_TEXT = `
[개인정보 처리방침]

1. 수집 항목: 이름, 연락처, 주소, 주문/예약 정보
2. 이용 목적: 주문 처리 및 서비스 제공, 고객 응대
3. 보유 기간: 목적 달성 후 지체 없이 파기 (단, 법령에 따른 보관은 예외)
`.trim();

function currentStoreId() {
    if (!window.qrnrStoreId) {
        showToast('매장 정보가 없습니다.', 'error');
        throw new Error('STORE_ID_NOT_INITIALIZED');
    }
    return window.qrnrStoreId;
}

/**
 * 1. DB에서 개인정보 처리방침 불러오기
 */
export async function renderPolicy() {
    const textarea = document.getElementById('privacy-text');
    if (!textarea) return;

    const sid = currentStoreId();

    try {
        // 우리가 아까 만든 store-settings API를 같이 사용합니다.
        const res = await fetch(`/api/store-settings?storeId=${sid}`);
        const data = await res.json();
        
        // DB에 저장된 값이 있으면 쓰고, 없으면 기본 문구를 보여줍니다.
        textarea.value = data.settings?.privacy_policy || DEFAULT_POLICY_TEXT;
    } catch (e) {
        console.error(e);
        showToast("방침 로딩 실패", "error");
    }
}

/**
 * 2. 저장 버튼 이벤트 연결
 */
export function bindPolicy() {
    const saveBtn = document.getElementById('privacy-save');
    const resetBtn = document.getElementById('privacy-reset');
    const textarea = document.getElementById('privacy-text');

    if (!saveBtn || !textarea) return;

    // [저장] 버튼 클릭
    saveBtn.onclick = async () => {
        const sid = currentStoreId();
        const text = textarea.value.trim();

        if (!text) {
            return showToast("내용을 입력해주세요.", "info");
        }

        try {
            const res = await fetch(`/api/store-settings?storeId=${sid}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ privacyPolicy: text })
            });

            if (res.ok) {
                showToast("✅ 개인정보 처리방침이 DB에 저장되었습니다.", "success");
                // 🚀 [추가] 방침 변경 신호 발송
                if (window.supabaseClient) {
                    const channel = window.supabaseClient.channel(`qrnr_realtime_${sid}`);
                    channel.subscribe(async (status) => {
                        if (status === 'SUBSCRIBED') {
                            await channel.send({
                                type: 'broadcast',
                                event: 'RELOAD_SIGNAL',
                                payload: { type: 'policy_update', at: Date.now() }
                            });
                        }
                    });
                }
            } else {
                showToast("저장 실패", "error");
            }
        } catch (e) {
            showToast("네트워크 오류", "error");
        }
    };

    // [기본 예시 불러오기] 버튼 클릭
    if (resetBtn) {
        resetBtn.onclick = () => {
            if (confirm("입력된 내용을 지우고 기본 예시로 채울까요?")) {
                textarea.value = DEFAULT_POLICY_TEXT;
                showToast("기본 문구가 채워졌습니다. [저장]을 눌러야 반영됩니다.", "info");
            }
        };
    }
}
