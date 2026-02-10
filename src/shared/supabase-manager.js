/**
 * Supabase 연결 및 채널 관리를 전담하는 싱글톤 클래스
 * /src/shared/supabase-manager.js
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

        // [핵심 보강] 기존에 열려있던 모든 채널을 물리적으로 닫아서 중복 리스너 방지
        await client.removeAllChannels();
        this.channels.clear();

        // 새 채널 생성
        const channel = client.channel(channelName, {
            config: { broadcast: { self: false } }
        });

        return new Promise((resolve) => {
            channel.subscribe((status) => {
                console.log(`📡 [Supabase] ${channelName} 상태:`, status);
                if (status === 'SUBSCRIBED') {
                    this.channels.set(channelName, channel);
                    resolve(channel);
                }
            });
        });
    }
}

export const supabaseMgr = new SupabaseManager();
