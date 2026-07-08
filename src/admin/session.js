const crypto = require('crypto');

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function createSessionStore() {
    const sessions = new Map();

    function create() {
        const id = crypto.randomBytes(32).toString('base64url');
        const csrf = crypto.randomBytes(32).toString('base64url');
        sessions.set(id, { csrf, expiresAt: Date.now() + SESSION_TTL_MS, pendingEntryToken: null, pendingUniversalEditToken: null });
        return { id, csrf };
    }

    function get(id) {
        const session = sessions.get(id);
        if (!session) return null;
        if (session.expiresAt <= Date.now()) {
            sessions.delete(id);
            return null;
        }
        session.expiresAt = Date.now() + SESSION_TTL_MS;
        return session;
    }

    function remove(id) {
        sessions.delete(id);
    }

    return { create, get, remove };
}

module.exports = { createSessionStore, SESSION_TTL_MS };
