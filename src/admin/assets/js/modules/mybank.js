// /src/admin/assets/js/modules/mybank.js
import { showToast } from '../admin.js';

/*function currentStoreId() {
    if (!window.qrnrStoreId) {
        showToast('매장 정보가 없습니다.', 'error');
        throw new Error('STORE_ID_NOT_INITIALIZED');
    }
    return window.qrnrStoreId;
}*/

// 1. DB에서 계좌 정보 불러와서 화면에 표시
export async function renderMyBank(storeId) {
    if (!storeId) return;
    const sid = storeId;
    const bankInput = document.getElementById('mb-bank');
    const acctInput = document.getElementById('mb-acct');
    const holderInput = document.getElementById('mb-holder');
    const currentSpan = document.getElementById('mb-current');

    try {
        const res = await fetch(`/api/store-settings?storeId=${sid}`);
        const data = await res.json();
        const b = data.settings?.owner_bank || {};

        if (bankInput) bankInput.value = b.bank || '';
        if (acctInput) acctInput.value = b.number || '';
        if (holderInput) holderInput.value = b.holder || '';

        if (currentSpan) {
            currentSpan.textContent = (b.bank && b.number && b.holder)
                ? `${b.bank} ${b.number} (${b.holder})`
                : '(저장된 정보 없음)';
        }
    } catch (e) {
        showToast("계좌 정보를 불러오지 못했습니다.", "error");
    }
}

// 2. 버튼 이벤트 연결
export function bindMyBank(storeId) {
    const saveBtn = document.getElementById('mb-save');
    const copyBtn = document.getElementById('mb-copy');

    // 저장 버튼
    if (saveBtn) {
        saveBtn.onclick = async () => {
            const sid = storeId;
            const bank = document.getElementById('mb-bank')?.value.trim();
            const number = document.getElementById('mb-acct')?.value.trim();
            const holder = document.getElementById('mb-holder')?.value.trim();

            if (!bank || !number || !holder) {
                return showToast('모든 정보를 입력해주세요.', 'info');
            }
            // 🚀 [추가] 중복 클릭 방지 및 로딩 표시
            saveBtn.disabled = true;
            saveBtn.classList.add('btn-loading');

            try {
            const res = await fetch(`/api/store-settings?storeId=${sid}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ownerBank: { bank, number, holder } })
            });

            if (res.ok) {
                showToast("✅ 계좌 정보가 안전하게 저장되었습니다.", "success");
                await renderMyBank(sid);
                if (window.supabaseClient) {
                    const channel = window.supabaseClient.channel(`qrnr_realtime_${sid}`);
                    channel.subscribe(async (status) => {
                        if (status === 'SUBSCRIBED') {
                            await channel.send({
                                type: 'broadcast',
                                event: 'RELOAD_SIGNAL',
                                payload: { type: 'bank_update', at: Date.now() }
                            });
                        }
                    });
                }

            } else {
                    showToast("저장 실패", "error");
                }
            } catch (err) {
                showToast("네트워크 오류 발생", "error");
            } finally {
                // 🚀 [추가] 어떤 경우에도 잠금 해제
                saveBtn.disabled = false;
                saveBtn.classList.remove('btn-loading');
            }
        };
    }

    // 복사 버튼
    if (copyBtn) {
        copyBtn.onclick = () => {
            const cur = document.getElementById('mb-current')?.textContent || '';
            if (!cur || cur.includes('저장된 정보 없음')) {
                return showToast('복사할 정보가 없습니다.', 'info');
            }
            navigator.clipboard.writeText(cur);
            showToast("📋 계좌 정보가 복사되었습니다.", "success");
        };
    }
}
