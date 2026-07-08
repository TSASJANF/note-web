const { ID_REGEX, MAX_ID_LENGTH } = require('./constants');
const { getClientIp } = require('./utils');

function validateNoteId(req, res, next) {
    const { id } = req.params;
    if (!id || !ID_REGEX.test(id) || id.length > MAX_ID_LENGTH) {
        const isHtmlView = req.path.endsWith('.md') || req.path.endsWith('.html');
        if (isHtmlView) {
            return res.status(400).send('Invalid note ID');
        }
        return res.status(400).json({ error: 'Invalid note ID' });
    }
    next();
}

function securityHeaders(req, res, next) {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.set('Cross-Origin-Opener-Policy', 'same-origin');
    res.set('X-Frame-Options', 'DENY');
    next();
}

function markdownSecurityHeaders(req, res, next) {
    res.set('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "object-src 'none'",
        "base-uri 'none'"
    ].join('; '));
    next();
}

function createRateLimiter({ windowMs, maxRequests }) {
    const clients = new Map();

    // 定期清理过期条目，防止内存泄漏
    const cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [key, value] of clients) {
            if (value.resetAt <= now) {
                clients.delete(key);
            }
        }
    }, Math.max(windowMs, 60_000));
    cleanupInterval.unref();

    return (req, res, next) => {
        const now = Date.now();
        const key = getClientIp(req);
        const current = clients.get(key);

        if (!current || current.resetAt <= now) {
            clients.set(key, { count: 1, resetAt: now + windowMs });
            return next();
        }

        current.count += 1;
        if (current.count > maxRequests) {
            res.set('Retry-After', Math.ceil((current.resetAt - now) / 1000));
            return res.status(429).json({ error: 'Too many requests' });
        }

        next();
    };
}

function errorHandler(err, req, res, next) {
    const status = err.status || 500;
    if (status >= 500) {
        console.error(`[ERROR] ${err.message}`, err.stack);
    }
    const message = status >= 500 ? 'Internal server error' : err.message;
    if (req.accepts('html') && !req.path.startsWith('/api/')) {
        const escapedMessage = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        res.status(status).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${status}</title></head><body><h1>${status}</h1><p>${escapedMessage}</p></body></html>`);
    } else {
        res.status(status).json({ error: message });
    }
}

module.exports = {
    validateNoteId,
    securityHeaders,
    markdownSecurityHeaders,
    createRateLimiter,
    errorHandler
};
