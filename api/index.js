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
        try { return await verifyJWT(token, process.env.JWT_SECRET || 'dev-secret'); } 
        catch (e) { return null; }
    };

    try {
        // --- [기능 1] 내 정보 확인 (필수) ---
        if (pathname === '/api/me' || pathname === '/api/verify') {
            const auth = await getAuth();
            return auth ? json({ ok: true, ...auth }) : json({ ok: false }, 401);
        }

        // --- [기능 2] 관리자 로그인 (필수) ---
        if (pathname === '/api/login-admin' && method === 'POST') {
            const { id, pw } = req.body;
            const admins = JSON.parse(process.env.ADMIN_USERS_JSON || '[]');
            const found = admins.find(a => a.id === id && a.pw === pw);
            if (!found) return json({ ok: false, message: "인증 실패" }, 401);
            const map = await queryOne('SELECT store_id FROM admin_stores WHERE admin_key = $1', [id]);
            const finalStoreId = map?.store_id || 'store1';
            const token = await signJWT({ realm: 'admin', uid: id, storeId: finalStoreId }, process.env.JWT_SECRET || 'dev-secret');
            res.setHeader('Set-Cookie', `admin_token=${token}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax`);
            return json({ ok: true, storeId: finalStoreId });
        }

        // --- [기능 3] 계좌 정보 및 설정 (수정 포인트!) ---
        if (pathname === '/api/store-settings') {
            if (method === 'GET') {
                const r = await queryOne('SELECT owner_bank, privacy_policy, notify_config, call_options FROM store_settings WHERE store_id = $1', [storeId]);
                
                // 데이터가 전혀 없을 때의 기본 구조 (mybank.js 에러 방지용)
                const settings = r || { 
                    owner_bank: null, 
                    privacy_policy: '', 
                    notify_config: null, 
                    call_options: null 
                };

                // DB에서 꺼낸 문자열을 프론트엔드가 즉시 사용할 수 있는 '객체'로 강제 변환
                const parseField = (field) => {
                    if (!field) return {};
                    if (typeof field === 'object') return field;
                    try { return JSON.parse(field); } catch(e) { return {}; }
                };

                settings.owner_bank = parseField(settings.owner_bank);
                settings.notify_config = parseField(settings.notify_config);
                // call_options는 배열이므로 별도 처리
                if (typeof settings.call_options === 'string') {
                    try { settings.call_options = JSON.parse(settings.call_options); } catch(e) { settings.call_options = []; }
                }

                return json({ ok: true, settings });
            }

            if (method === 'PUT') {
                const { ownerBank, privacyPolicy, notifyConfig, callOptions } = req.body;
                // 저장할 때는 문자열로 쪄서 넣기
                await query(`INSERT INTO store_settings (store_id, owner_bank, privacy_policy, notify_config, call_options) VALUES ($1, $2, $3, $4, $5) 
                             ON CONFLICT (store_id) DO UPDATE SET 
                             owner_bank=COALESCE($2, store_settings.owner_bank), 
                             privacy_policy=COALESCE($3, store_settings.privacy_policy), 
                             notify_config=COALESCE($4, store_settings.notify_config), 
                             call_options=COALESCE($5, store_settings.call_options)`, 
                             [storeId, ownerBank ? JSON.stringify(ownerBank) : null, privacyPolicy, notifyConfig ? JSON.stringify(notifyConfig) : null, callOptions ? JSON.stringify(callOptions) : null]);
                return json({ ok: true });
            }
        }

        // 주문 로직 (기존 유지)
        if (pathname === '/api/orders' && method === 'GET') {
            const r = await query('SELECT * FROM orders WHERE store_id = $1 ORDER BY created_at DESC', [storeId]);
            return json({ ok: true, orders: r.rows || [] });
        }

        return json({ error: 'NOT_FOUND' }, 404);
    } catch (e) {
        return json({ ok: false, error: e.message }, 500);
    }
}
