import crypto from 'crypto';

/** Constant-time string comparison (hashing first so lengths never leak). */
export const safeEqual = (a, b) => {
    const ha = crypto.createHash('sha256').update(String(a ?? '')).digest();
    const hb = crypto.createHash('sha256').update(String(b ?? '')).digest();
    return crypto.timingSafeEqual(ha, hb) && a !== undefined && b !== undefined;
};

/**
 * Resolves how the admin surface (web UI, /api/*, log WebSocket) is protected.
 * - ADMIN_USERNAME + ADMIN_PASSWORD set  -> HTTP Basic auth required.
 * - ADMIN_AUTH_DISABLED=true             -> open (local demos only).
 * - neither                              -> admin surface disabled (503); webhooks still work.
 */
export const resolveAdminAuth = ({
    username = process.env.ADMIN_USERNAME,
    password = process.env.ADMIN_PASSWORD,
    disabled = process.env.ADMIN_AUTH_DISABLED === 'true',
} = {}) => {
    if (username && password) return { mode: 'basic', username, password };
    if (disabled) return { mode: 'open' };
    return { mode: 'locked' };
};

/**
 * Checks a request's Authorization header against the admin config.
 * @returns {'ok'|'unauthorized'|'locked'}
 */
export const checkAdminRequest = (config, authorizationHeader) => {
    if (config.mode === 'open') return 'ok';
    if (config.mode === 'locked') return 'locked';

    const match = /^Basic\s+(.+)$/i.exec(authorizationHeader || '');
    if (!match) return 'unauthorized';
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    if (sep < 0) return 'unauthorized';
    const userOk = safeEqual(decoded.slice(0, sep), config.username);
    const passOk = safeEqual(decoded.slice(sep + 1), config.password);
    return userOk && passOk ? 'ok' : 'unauthorized';
};

/** Express middleware enforcing the admin config. */
export const requireAdmin = (config) => (req, res, next) => {
    const result = checkAdminRequest(config, req.headers.authorization);
    if (result === 'ok') return next();
    if (result === 'locked') {
        return res.status(503).json({
            error: 'Admin UI and API are disabled. Set ADMIN_USERNAME and ADMIN_PASSWORD (or ADMIN_AUTH_DISABLED=true for local use).'
        });
    }
    res.set('WWW-Authenticate', 'Basic realm="sinch-conference-middleware", charset="UTF-8"');
    return res.status(401).json({ error: 'Authentication required' });
};
