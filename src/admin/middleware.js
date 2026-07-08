const { verifyPassword } = require('../auth');
const { parseCookies } = require('./cookies');
const { SESSION_TTL_MS } = require('./session');

const SESSION_COOKIE = 'note_admin_session';
const ENTRY_COOKIE = 'note_admin_entry';
const ENTRY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function isAdminEnabled(config) {
    return Boolean(config.adminUsername && config.adminPasswordHash);
}

function setCookie(res, name, value, path, maxAgeSeconds) {
    res.append('Set-Cookie', `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Strict; Path=${path}; Max-Age=${maxAgeSeconds}`);
}

function setSessionCookie(res, sessionId, basePath) {
    setCookie(res, SESSION_COOKIE, sessionId, basePath, SESSION_TTL_MS / 1000);
}

function setEntryCookie(res, basePath) {
    setCookie(res, ENTRY_COOKIE, '1', basePath, ENTRY_TTL_MS / 1000);
}

function clearSessionCookie(res, basePath) {
    setCookie(res, SESSION_COOKIE, '', basePath, 0);
}

function getSession(req, sessions) {
    const cookies = parseCookies(req.get('Cookie'));
    const sessionId = cookies[SESSION_COOKIE];
    const session = sessions.get(sessionId);
    return session ? { sessionId, session } : null;
}

function requireAdmin(sessions, loginPath) {
    return (req, res, next) => {
        const current = getSession(req, sessions);
        if (!current) {
            return res.redirect(302, loginPath);
        }
        req.adminSession = current;
        next();
    };
}

function requireCsrf(req, res, next) {
    if (req.body?.csrf !== req.adminSession?.session.csrf) {
        return res.status(403).send('CSRF 令牌无效');
    }
    next();
}

module.exports = {
    SESSION_COOKIE, ENTRY_COOKIE,
    isAdminEnabled, setCookie, setSessionCookie, setEntryCookie, clearSessionCookie,
    getSession, requireAdmin, requireCsrf
};
