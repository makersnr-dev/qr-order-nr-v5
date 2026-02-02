import { query, queryOne } from './_lib/db.js';
import { verifyJWT, signJWT } from '../src/shared/jwt.js';

export default async function handler(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const method = req.method;
    const params = url.searchParams;
    const storeId = params.get('storeId') || req.body?.storeId;

    const json = (body, status = 200) => {
        res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.send(JSON.stringify(body));
    };

    const getAuth = async () => {
        const cookie = req.headers.cookie || '';
        const cookies = {};
        cookie.split(';').forEach(item => {
            const parts = item.trim().split('=');
            if (parts.length >= 2) cookies[parts[0]] = parts[1];
        });
        const token = cookies['super_token'] || cookies['admin_token'];
        if (!token) return null;
        try { 
            return await verifyJWT(token, process.env.JWT_SECRET || 'dev-secret'); 
        } catch (e) { return null; }
    };

    try {
        // --- 0. 기초 연결 및 인증 확인 ---
        if (pathname === '/api/test') return json({ ok: true, message: "2단계: 로그인 로직 추가됨" });
        
        if (pathname === '/api/me' || pathname === '/api/verify') {
            const auth = await getAuth();
            return auth ? json({ ok: true, ...auth }) : json({ ok: false }, 401);
        }

        // --- 1. 일반 관리자 로그인 (login.html 대응) ---
        if (pathname === '/api/login-admin' && method === 'POST') {
            const { id, pw } = req.body;
            const admins = JSON.parse(process.env.ADMIN_USERS_JSON || '[]');
            const found = admins.find(a => a.id === id && a.pw === pw);
            
            if (!found) return json({ ok: false, message: "아이디 또는 비밀번호가 틀렸습니다." }, 401);
            
            // DB에서 매장 매핑 정보 가져오기
            const map = await queryOne('SELECT store_id FROM admin_stores WHERE admin_key = $1', [id]);
            const finalStoreId = map?.store_id || 'store1';
            
            const token = await signJWT({ realm: 'admin', uid: id, storeId: finalStoreId }, process.env.JWT_SECRET || 'dev-secret');
            res.setHeader('Set-Cookie', `admin_token=${token}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax`);
            
            return json({ ok: true, storeId: finalStoreId });
        }

        // --- 2. 매장 설정 조회/저장 (mybank.js, policy.js 대응) ---
        if (pathname === '/api/store-settings') {
            if (method === 'GET') {
                const r = await queryOne('SELECT owner_bank, privacy_policy, notify_config, call_options FROM store_settings WHERE store_id = $1', [storeId]);
                
                const defaultSettings = {
                    owner_bank: { bank: '', number: '', holder: '' },
                    privacy_policy: '',
                    notify_config: { useBeep: true, beepVolume: 0.7, desktop: true },
                    call_options: ['물/수저 요청', '테이블 정리', '주문 문의']
                };

                const settings = r || defaultSettings;

                // JSON 문자열 자동 파싱
                if (typeof settings.owner_bank === 'string') try { settings.owner_bank = JSON.parse(settings.owner_bank); } catch(e){}
                if (typeof settings.notify_config === 'string') try { settings.notify_config = JSON.parse(settings.notify_config); } catch(e){}
                if (typeof settings.call_options === 'string') try { settings.call_options = JSON.parse(settings.call_options); } catch(e){}

                return json({ ok: true, settings });
            }
            
            if (method === 'PUT') {
                const { ownerBank, privacyPolicy, notifyConfig, callOptions } = req.body;
                const b = ownerBank ? JSON.stringify(ownerBank) : null;
                const n = notifyConfig ? JSON.stringify(notifyConfig) : null;
                const c = callOptions ? JSON.stringify(callOptions) : null;

                await query(`INSERT INTO store_settings (store_id, owner_bank, privacy_policy, notify_config, call_options) VALUES ($1, $2, $3, $4, $5) 
                             ON CONFLICT (store_id) DO UPDATE SET 
                             owner_bank=COALESCE($2, store_settings.owner_bank), 
                             privacy_policy=COALESCE($3, store_settings.privacy_policy), 
                             notify_config=COALESCE($4, store_settings.notify_config), 
                             call_options=COALESCE($5, store_settings.call_options)`, 
                             [storeId, b, privacyPolicy, n, c]);
                return json({ ok: true });
            }
        }

        return json({ error: 'NOT_FOUND', path: pathname }, 404);
    } catch (e) {
        console.error(e);
        return json({ ok: false, error: e.message }, 500);
    }
}
