/**
 * Supabase 연결 및 채널 관리를 전담하는 싱글톤 클래스
 */
class SupabaseManager {
    constructor() {
        if (SupabaseManager.instance) return SupabaseManager.instance;
        this.client = null;
        this.channels = new Map(); // 채널 중복 방지용 저장소
        SupabaseManager.instance = this;
    }

    // 초기화 및 클라이언트 반환
    async getClient() {
        if (this.client) return this.client;

        const res = await fetch('/api/config');
        const { supabaseUrl, supabaseKey } = await res.json();
        
        // window.supabase는 HTML에서 로드된 라이브러리 객체
        this.client = window.supabase.createClient(supabaseUrl, supabaseKey);
        return this.client;
    }

    /**
     * 특정 매장의 실시간 채널을 가져오거나 새로 생성 (중복 방지 핵심)
     */
    async getChannel(storeId) {
        const client = await this.getClient();
        const channelName = `qrnr_realtime_${storeId}`;

        // 이미 관리 중인 채널이 있다면 반환
        if (this.channels.has(channelName)) {
            return this.channels.get(channelName);
        }

        // 기존에 수동으로 생성된 동일 이름의 채널이 있는지 클라이언트 내부 확인
        let channel = client.getChannels().find(c => c.name === channelName);
        
        if (!channel) {
            channel = client.channel(channelName);
            channel.subscribe((status) => {
                console.log(`📡 [Supabase] ${channelName} status:`, status);
            });
        }

        this.channels.set(channelName, channel);
        return channel;
    }
}

export const supabaseMgr = new SupabaseManager();
