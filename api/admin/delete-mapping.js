
import { verifyJWT } from "../../src/shared/jwt.js";
import { Pool } from '@neondatabase/serverless';

export const config = { runtime: 'edge' };

export default async function handler(req) {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }), { status: 405 });
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        // 1. Auth Check
        const auth = req.headers.get('authorization') || "";
        if (!auth.startsWith("Bearer ")) throw new Error("NO_TOKEN");
        const token = auth.slice(7);
        const payload = await verifyJWT(token, process.env.SUPER_JWT_SECRET || "super-secret-dev");

        if (!payload) throw new Error("INVALID_TOKEN");
        if (payload.realm !== 'super' && !payload.isSuper) throw new Error("NOT_SUPER");

        // 2. Parse Body
        const body = await req.json();
        const { adminId, storeId } = body;

        if (!adminId || !storeId) throw new Error("MISSING_FIELDS");

        // 3. Delete from admin_store_mapping
        await pool.query(
            `DELETE FROM admin_store_mapping WHERE admin_id = $1 AND store_id = $2`,
            [adminId, storeId]
        );

        return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (e) {
        console.error('[delete-mapping] error:', e);
        return new Response(JSON.stringify({ ok: false, error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    } finally {
        await pool.end();
    }
}
