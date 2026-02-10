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
            
            if (!window.supabase) {
                throw new Error("Supabase 라이브러리가 로드되지 않았습니다.");
            }

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

        // 1. 이미 캐싱된 채널이 있고 상태가 정상이면 반환
        if (this.channels.has(channelName)) {
            const existingChannel = this.channels.get(channelName);
            // 채널이 닫혔거나 에러 상태가 아니면 재사용
            if (existingChannel.state === 'joined') return existingChannel;
            
            // 상태가 좋지 않으면 기존 채널 제거 후 새로 생성하도록 진행
            client.removeChannel(existingChannel);
        }

        // 2. 새 채널 생성 및 구독
        const channel = client.channel(channelName, {
            config: {
                broadcast: { self: false }, // 내가 보낸 신호는 내가 받지 않음 (최적화)
            }
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
