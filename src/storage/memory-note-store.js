const crypto = require('crypto');

function createToken() {
    return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
    if (!token) return null;
    return crypto.createHash('sha256').update(token, 'utf-8').digest('hex');
}

function nowIso() {
    return new Date().toISOString();
}

function createMemoryNoteStore() {
    const notes = new Map();
    const activityLogs = [];
    const settings = new Map();

    function noteExists(id) {
        return notes.has(id);
    }

    function countNotesByIdLength(length) {
        let count = 0;
        for (const id of notes.keys()) {
            if (id.length === length) count++;
        }
        return count;
    }

    function getNoteRecord(id) {
        const note = notes.get(id);
        return note ? { ...note } : null;
    }

    function getNote(id) {
        const record = getNoteRecord(id);
        return record?.content ?? null;
    }

    function createNote(id, opts = {}) {
        const timestamp = nowIso();
        const tokenRequired = opts.editTokenRequired === true;
        const editToken = tokenRequired ? (opts.editToken === undefined ? createToken() : opts.editToken) : null;
        const content = opts.content || '';
        const createdAt = opts.createdAt || timestamp;
        const updatedAt = opts.updatedAt || timestamp;
        const deletedAt = content.length === 0 ? updatedAt : null;

        const note = {
            id, content,
            readonly: opts.readonly === true,
            version: opts.version || 1,
            editTokenHash: tokenRequired ? hashToken(editToken) : null,
            adminTokenHash: null,
            editTokenRequired: tokenRequired,
            deletedAt,
            creatorIp: opts.creatorIp || null,
            createdByAdmin: opts.createdByAdmin === true,
            hidden: opts.hidden === true,
            illegalMarkedAt: opts.illegalMarkedAt || null,
            createdAt, updatedAt
        };
        notes.set(id, note);
        return { ...note, editToken };
    }

    function saveNote(id, content, opts = {}) {
        if (typeof content !== 'string') return { ok: false, reason: 'invalid_content' };
        const existing = notes.get(id);
        if (!existing) return { ok: false, reason: 'not_found' };
        if (existing.readonly) return { ok: false, reason: 'readonly', record: { ...existing } };

        const expectedVersion = Number(opts.expectedVersion);
        if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
            return { ok: false, reason: 'missing_version', record: { ...existing } };
        }
        if (existing.version !== expectedVersion) {
            return { ok: false, reason: 'version_conflict', record: { ...existing } };
        }

        const timestamp = nowIso();
        existing.content = content;
        existing.deletedAt = content.length === 0 ? timestamp : null;
        existing.version += 1;
        existing.updatedAt = timestamp;
        return { ok: true, record: { ...existing } };
    }

    function deleteNote(id) {
        return notes.delete(id);
    }

    function getMeta(id) {
        const record = getNoteRecord(id);
        if (!record) return {};
        return { readonly: record.readonly, version: record.version, deletedAt: record.deletedAt, createdAt: record.createdAt, updatedAt: record.updatedAt };
    }

    function saveMeta(id, meta) {
        if (!noteExists(id)) { createNote(id, { readonly: Boolean(meta.readonly) }); return true; }
        setReadonly(id, Boolean(meta.readonly));
        return true;
    }

    function isReadonly(id) {
        return notes.get(id)?.readonly === true;
    }

    function setReadonly(id, readonly) {
        const note = notes.get(id);
        if (!note) { createNote(id, { readonly }); return true; }
        note.readonly = readonly;
        note.version += 1;
        note.updatedAt = nowIso();
        return true;
    }

    function rotateTokens(id) {
        const note = notes.get(id);
        if (!note) return null;
        const editToken = createToken();
        note.editTokenHash = hashToken(editToken);
        note.adminTokenHash = null;
        note.version += 1;
        note.updatedAt = nowIso();
        return { ...note, editToken };
    }

    function setTokenMode(id, required) {
        const note = notes.get(id);
        if (!note) return null;
        const editToken = required ? createToken() : null;
        note.editTokenRequired = required;
        note.editTokenHash = required ? hashToken(editToken) : null;
        note.adminTokenHash = null;
        note.version += 1;
        note.updatedAt = nowIso();
        return { ...note, editToken };
    }

    function adminUpdateNoteContent(id, content) {
        if (typeof content !== 'string') return null;
        const note = notes.get(id);
        if (!note) return null;
        const timestamp = nowIso();
        note.content = content;
        note.deletedAt = content.length === 0 ? timestamp : null;
        note.version += 1;
        note.updatedAt = timestamp;
        return { ...note };
    }

    function listNotes(opts = {}) {
        const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
        let arr = Array.from(notes.values());
        if (opts.filter === 'empty') arr = arr.filter(n => n.deletedAt !== null || n.content === '');
        if (opts.filter === 'illegal') arr = arr.filter(n => n.illegalMarkedAt !== null);
        arr.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return arr.slice(0, limit).map(n => ({ ...n }));
    }

    function setHidden(id, hidden) {
        const note = notes.get(id);
        if (!note) return false;
        note.hidden = hidden;
        if (hidden) note.illegalMarkedAt = null;
        note.version += 1;
        note.updatedAt = nowIso();
        return true;
    }

    function markIllegal(id) {
        const note = notes.get(id);
        if (!note || note.illegalMarkedAt) return false;
        note.illegalMarkedAt = nowIso();
        note.readonly = true;
        return true;
    }

    function clearIllegal(id) {
        const note = notes.get(id);
        if (!note) return false;
        note.illegalMarkedAt = null;
        return true;
    }

    function logActivity({ ip, noteId, action, isAdmin = false, metadata = null }) {
        activityLogs.push({ occurred_at: nowIso(), ip: ip || 'unknown', note_id: noteId || null, action, is_admin: isAdmin ? 1 : 0, metadata: metadata ? JSON.stringify(metadata) : null });
    }

    function listActivity(opts = {}) {
        const limit = Math.min(Math.max(Number(opts.limit) || 200, 1), 1000);
        return activityLogs.slice(-limit).reverse();
    }

    function purgeActivityOlderThan(days) { return 0; }
    function purgeDeletedOlderThan(days) { return 0; }
    function purgeAllDeleted() {
        let count = 0;
        for (const [id, note] of notes) {
            if (note.deletedAt) { notes.delete(id); count++; }
        }
        return count;
    }

    function getSetting(key, fallback = null) { return settings.get(key) ?? fallback; }
    function setSetting(key, value) { settings.set(key, String(value)); return true; }

    function hasEditAccess(record, token) {
        if (!record) return true;
        if (!record.editTokenRequired) return true;
        const hashed = hashToken(token);
        return Boolean(hashed && hashed === record.editTokenHash);
    }

    function close() { notes.clear(); activityLogs.length = 0; settings.clear(); }

    return {
        noteExists, countNotesByIdLength, getNoteRecord, getNote, createNote, saveNote, deleteNote,
        getMeta, saveMeta, isReadonly, setReadonly, rotateTokens, setTokenMode, adminUpdateNoteContent,
        listNotes, purgeDeletedOlderThan, purgeAllDeleted, getSetting, setSetting, setHidden,
        markIllegal, clearIllegal, logActivity, listActivity, purgeActivityOlderThan, hasEditAccess, close
    };
}

module.exports = { createMemoryNoteStore, hashToken };
