/**
 * /src/shared/supabase-manager.js 수정본
 */
class SupabaseManager {
    constructor() {
        if (SupabaseManager.instance) return SupabaseManager.instance;
        this.client = null;
        this.channels = new Map(); 
        SupabaseManager.instance = this;
    }

    async getClient() {
        if (this.client) return this.client;
        try {
            const res = await fetch('/api/config');
            const { supabaseUrl, supabaseKey } = await res.json();
            if (!window.supabase) throw new Error("Supabase 라이브러리 로드 실패");
            this.client = window.supabase.createClient(supabaseUrl, supabaseKey);
            return this.client;
        } catch (e) {
            console.error("❌ Supabase 초기화 실패:", e);
            return null;
        }
    }

    async getChannel(storeId) {
        if (!storeId) return null;
        const client = await this.getClient();
        if (!client) return null;

        const channelName = `qrnr_realtime_${storeId}`;

        // ✅ [개선 1] 이미 활성화된 채널이 있다면 그대로 반환 (중복 방지)
        if (this.channels.has(channelName)) {
            const existingChannel = this.channels.get(channelName);
            if (existingChannel.state === 'joined') {
                return existingChannel;
            }
            // 상태가 이상하면 제거 후 다시 생성하도록 진행
            client.removeChannel(existingChannel);
        }

        // ✅ [개선 2] 무조건적인 removeAllChannels() 제거
        // 대신 필요한 채널만 관리합니다.

        const channel = client.channel(channelName, {
            config: { broadcast: { self: false } }
        });

        return new Promise((resolve) => {
            // ✅ [개선 3] 5초 타임아웃 안전장치 (무한 대기 방지)
            const timer = setTimeout(() => {
                console.warn(`⏳ [Supabase] ${channelName} 연결 타임아웃`);
                resolve(null); 
            }, 5000);

            channel.subscribe((status) => {
                console.log(`📡 [Supabase] ${channelName} 상태:`, status);
                
                if (status === 'SUBSCRIBED') {
                    clearTimeout(timer);
                    this.channels.set(channelName, channel);
                    resolve(channel);
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    clearTimeout(timer);
                    client.removeChannel(channel);
                    resolve(null);
                }
            });
        });
    }
    // 🧹 [추가 1] 특정 매장의 채널만 콕 집어서 끊기 (페이지 이동 시 사용)
    async unsubscribe(storeId) {
        if (!this.client || !storeId) return;
        const channelName = `qrnr_realtime_${storeId}`;
        const channel = this.channels.get(channelName);
        
        if (channel) {
            await this.client.removeChannel(channel);
            this.channels.delete(channelName);
            console.log(`🧹 [Supabase] ${channelName} 채널을 안전하게 종료했습니다.`);
        }
    }

    // 🧹 [추가 2] 열려있는 모든 채널 한 번에 끊기 (브라우저 종료/새로고침 시 방어용)
    async unsubscribeAll() {
        if (!this.client) return;
        for (const [name, channel] of this.channels.entries()) {
            await this.client.removeChannel(channel);
            console.log(`🧹 [Supabase] ${name} 채널 강제 종료 완료`);
        }
        this.channels.clear();
    }
}

export const supabaseMgr = new SupabaseManager();
