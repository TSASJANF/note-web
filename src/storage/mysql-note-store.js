const crypto = require('crypto');

function createToken() {
    return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
    if (!token) return null;
    return crypto.createHash('sha256').update(token, 'utf-8').digest('hex');
}

function nowDatetime() {
    // Return MySQL DATETIME(3) format: YYYY-MM-DD HH:MM:SS.mmm
    return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function toMysqlDatetime(isoStr) {
    if (!isoStr) return null;
    // Convert ISO 8601 to MySQL DATETIME(3) format
    return isoStr.replace('T', ' ').replace('Z', '').replace(/\.\d+$/, (m) => m.padEnd(4, '0'));
}

async function createMysqlNoteStore(options = {}) {
    const mysql = require('mysql2/promise');

    const pool = mysql.createPool({
        host: options.host || process.env.MYSQL_HOST || 'localhost',
        port: Number(options.port || process.env.MYSQL_PORT || 3306),
        user: options.user || process.env.MYSQL_USER || 'root',
        password: options.password || process.env.MYSQL_PASSWORD || '',
        database: options.database || process.env.MYSQL_DATABASE || 'noteweb',
        waitForConnections: true,
        connectionLimit: Number(options.connectionLimit || 20),
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0
    });

    async function query(sql, params = []) {
        const [rows] = await pool.query(sql, params);
        return rows;
    }

    async function queryOne(sql, params = []) {
        const rows = await query(sql, params);
        return rows[0] || null;
    }

    async function execute(sql, params = []) {
        const [result] = await pool.execute(sql, params);
        return result;
    }

    async function initTables() {
        await execute(`
            CREATE TABLE IF NOT EXISTS notes (
                id VARCHAR(64) PRIMARY KEY,
                content LONGTEXT NOT NULL,
                readonly TINYINT NOT NULL DEFAULT 0,
                version INT NOT NULL DEFAULT 1,
                edit_token_hash VARCHAR(64),
                admin_token_hash VARCHAR(64),
                edit_token_required TINYINT NOT NULL DEFAULT 0,
                deleted_at DATETIME(3),
                creator_ip VARCHAR(45),
                created_by_admin TINYINT NOT NULL DEFAULT 1,
                hidden TINYINT NOT NULL DEFAULT 0,
                illegal_marked_at DATETIME(3),
                created_at DATETIME(3) NOT NULL,
                updated_at DATETIME(3) NOT NULL,
                INDEX idx_deleted (deleted_at),
                INDEX idx_illegal (illegal_marked_at),
                INDEX idx_updated (updated_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await execute(`
            CREATE TABLE IF NOT EXISTS settings (
                \`key\` VARCHAR(255) PRIMARY KEY,
                value TEXT NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await execute(`
            CREATE TABLE IF NOT EXISTS activity_logs (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                occurred_at DATETIME(3) NOT NULL,
                ip VARCHAR(45) NOT NULL,
                note_id VARCHAR(64),
                action VARCHAR(50) NOT NULL,
                is_admin TINYINT NOT NULL DEFAULT 0,
                metadata TEXT,
                INDEX idx_occurred (occurred_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Token mode migration
        const tokenModeMigration = await queryOne('SELECT value FROM settings WHERE `key` = ?', ['token-mode-migration-v1']);
        if (tokenModeMigration?.value !== 'done') {
            await execute('UPDATE notes SET edit_token_hash = NULL, admin_token_hash = NULL, edit_token_required = 0');
            await execute('INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', ['token-mode-migration-v1', 'done']);
        }

        // Mark empty notes
        await execute("UPDATE notes SET deleted_at = updated_at WHERE content = '' AND deleted_at IS NULL");
    }

    function rowToRecord(row) {
        if (!row) return null;
        return {
            id: row.id,
            content: row.content,
            readonly: row.readonly === 1,
            version: row.version,
            editTokenHash: row.edit_token_hash,
            adminTokenHash: row.admin_token_hash,
            editTokenRequired: row.edit_token_required === 1,
            deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
            creatorIp: row.creator_ip,
            createdByAdmin: row.created_by_admin === 1,
            hidden: row.hidden === 1,
            illegalMarkedAt: row.illegal_marked_at ? new Date(row.illegal_marked_at).toISOString() : null,
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
            updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
        };
    }

    async function noteExists(id) {
        const row = await queryOne('SELECT 1 FROM notes WHERE id = ?', [id]);
        return Boolean(row);
    }

    async function countNotesByIdLength(length) {
        const row = await queryOne('SELECT COUNT(*) AS count FROM notes WHERE CHAR_LENGTH(id) = ?', [length]);
        return row.count;
    }

    async function getNoteRecord(id) {
        const row = await queryOne('SELECT * FROM notes WHERE id = ?', [id]);
        return rowToRecord(row);
    }

    async function getNote(id) {
        const record = await getNoteRecord(id);
        return record?.content ?? null;
    }

    async function createNote(id, opts = {}) {
        const timestamp = nowDatetime();
        const tokenRequired = opts.editTokenRequired === true;
        const editToken = tokenRequired ? (opts.editToken === undefined ? createToken() : opts.editToken) : null;
        const content = opts.content || '';
        const createdAt = opts.createdAt || timestamp;
        const updatedAt = opts.updatedAt || timestamp;
        const deletedAt = content.length === 0 ? updatedAt : null;

        await execute(
            `INSERT INTO notes (id, content, readonly, version, edit_token_hash, admin_token_hash, edit_token_required, deleted_at, creator_ip, created_by_admin, hidden, illegal_marked_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id, content, opts.readonly ? 1 : 0, opts.version || 1,
                tokenRequired ? hashToken(editToken) : null, null,
                tokenRequired ? 1 : 0, deletedAt,
                opts.creatorIp || null, opts.createdByAdmin ? 1 : 0,
                opts.hidden ? 1 : 0, opts.illegalMarkedAt || null,
                createdAt, updatedAt
            ]
        );
        const record = await getNoteRecord(id);
        return { ...record, editToken };
    }

    async function saveNote(id, content, opts = {}) {
        if (typeof content !== 'string') return { ok: false, reason: 'invalid_content' };

        const existing = await getNoteRecord(id);
        if (!existing) return { ok: false, reason: 'not_found' };
        if (existing.readonly) return { ok: false, reason: 'readonly', record: existing };

        const expectedVersion = Number(opts.expectedVersion);
        if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
            return { ok: false, reason: 'missing_version', record: existing };
        }

        const timestamp = nowDatetime();
        const deletedAt = content.length === 0 ? timestamp : null;
        const result = await execute(
            'UPDATE notes SET content = ?, deleted_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?',
            [content, deletedAt, timestamp, id, expectedVersion]
        );
        if (result.affectedRows === 0) {
            return { ok: false, reason: 'version_conflict', record: await getNoteRecord(id) };
        }
        return { ok: true, record: await getNoteRecord(id) };
    }

    async function deleteNote(id) {
        const result = await execute('DELETE FROM notes WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }

    async function getMeta(id) {
        const record = await getNoteRecord(id);
        if (!record) return {};
        return {
            readonly: record.readonly,
            version: record.version,
            deletedAt: record.deletedAt,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt
        };
    }

    async function saveMeta(id, meta) {
        if (!await noteExists(id)) {
            await createNote(id, { readonly: Boolean(meta.readonly) });
            return true;
        }
        await setReadonly(id, Boolean(meta.readonly));
        return true;
    }

    async function isReadonly(id) {
        const record = await getNoteRecord(id);
        return record?.readonly === true;
    }

    async function setReadonly(id, readonly) {
        if (!await noteExists(id)) {
            await createNote(id, { readonly });
            return true;
        }
        await execute('UPDATE notes SET readonly = ?, version = version + 1, updated_at = ? WHERE id = ?', [readonly ? 1 : 0, nowDatetime(), id]);
        return true;
    }

    async function rotateTokens(id) {
        const record = await getNoteRecord(id);
        if (!record) return null;
        const editToken = createToken();
        await execute('UPDATE notes SET edit_token_hash = ?, admin_token_hash = NULL, version = version + 1, updated_at = ? WHERE id = ?', [hashToken(editToken), nowDatetime(), id]);
        return { ...await getNoteRecord(id), editToken };
    }

    async function setTokenMode(id, required) {
        if (!await noteExists(id)) return null;
        const editToken = required ? createToken() : null;
        await execute('UPDATE notes SET edit_token_required = ?, edit_token_hash = ?, admin_token_hash = NULL, version = version + 1, updated_at = ? WHERE id = ?', [required ? 1 : 0, required ? hashToken(editToken) : null, nowDatetime(), id]);
        return { ...await getNoteRecord(id), editToken };
    }

    async function adminUpdateNoteContent(id, content) {
        if (typeof content !== 'string') return null;
        if (!await noteExists(id)) return null;
        const timestamp = nowDatetime();
        const deletedAt = content.length === 0 ? timestamp : null;
        await execute('UPDATE notes SET content = ?, deleted_at = ?, version = version + 1, updated_at = ? WHERE id = ?', [content, deletedAt, timestamp, id]);
        return await getNoteRecord(id);
    }

    async function listNotes(opts = {}) {
        const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
        const offset = Math.max(Number(opts.offset) || 0, 0);
        let sql;
        if (opts.filter === 'empty') {
            sql = 'SELECT * FROM notes WHERE deleted_at IS NOT NULL OR content = \'\' ORDER BY COALESCE(deleted_at, updated_at) ASC, id ASC LIMIT ? OFFSET ?';
        } else if (opts.filter === 'illegal') {
            sql = 'SELECT * FROM notes WHERE illegal_marked_at IS NOT NULL ORDER BY illegal_marked_at ASC LIMIT ? OFFSET ?';
        } else {
            sql = 'SELECT * FROM notes ORDER BY updated_at DESC, id ASC LIMIT ? OFFSET ?';
        }
        const rows = await query(sql, [limit, offset]);
        return rows.map(rowToRecord);
    }

    async function setHidden(id, hidden) {
        const result = await execute(
            'UPDATE notes SET hidden = ?, illegal_marked_at = CASE WHEN ? = 1 THEN NULL ELSE illegal_marked_at END, version = version + 1, updated_at = ? WHERE id = ?',
            [hidden ? 1 : 0, hidden ? 1 : 0, nowDatetime(), id]
        );
        return result.affectedRows > 0;
    }

    async function markIllegal(id) {
        const result = await execute('UPDATE notes SET illegal_marked_at = COALESCE(illegal_marked_at, ?), readonly = 1 WHERE id = ?', [nowDatetime(), id]);
        return result.affectedRows > 0;
    }

    async function clearIllegal(id) {
        const result = await execute('UPDATE notes SET illegal_marked_at = NULL WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }

    async function logActivity({ ip, noteId, action, isAdmin = false, metadata = null }) {
        await execute('INSERT INTO activity_logs (occurred_at, ip, note_id, action, is_admin, metadata) VALUES (?, ?, ?, ?, ?, ?)', [nowDatetime(), ip || 'unknown', noteId || null, action, isAdmin ? 1 : 0, metadata ? JSON.stringify(metadata) : null]);
    }

    async function listActivity(opts = {}) {
        const limit = Math.min(Math.max(Number(opts.limit) || 200, 1), 1000);
        const offset = Math.max(Number(opts.offset) || 0, 0);
        return await query('SELECT id, occurred_at, ip, note_id, action, is_admin, metadata FROM activity_logs ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?', [limit, offset]);
    }

    async function purgeActivityOlderThan(days) {
        const parsed = Number(days);
        if (!Number.isFinite(parsed) || parsed <= 0) return 0;
        const cutoff = new Date(Date.now() - parsed * 24 * 60 * 60 * 1000).toISOString();
        const result = await execute('DELETE FROM activity_logs WHERE occurred_at < ?', [cutoff]);
        return result.affectedRows;
    }

    async function purgeDeletedOlderThan(days) {
        const parsed = Number(days);
        if (!Number.isFinite(parsed) || parsed <= 0) return 0;
        const cutoff = new Date(Date.now() - parsed * 24 * 60 * 60 * 1000).toISOString();
        const result = await execute('DELETE FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ?', [cutoff]);
        return result.affectedRows;
    }

    async function purgeAllDeleted() {
        const result = await execute('DELETE FROM notes WHERE deleted_at IS NOT NULL');
        return result.affectedRows;
    }

    async function getSetting(key, fallback = null) {
        const row = await queryOne('SELECT value FROM settings WHERE `key` = ?', [key]);
        return row?.value ?? fallback;
    }

    async function setSetting(key, value) {
        await execute('INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', [key, String(value)]);
        return true;
    }

    function hasEditAccess(record, token) {
        if (!record) return true;
        if (!record.editTokenRequired) return true;
        const hashed = hashToken(token);
        return Boolean(hashed && hashed === record.editTokenHash);
    }

    async function close() {
        await pool.end();
    }

    // Initialize tables
    await initTables();

    return {
        noteExists,
        countNotesByIdLength,
        getNoteRecord,
        getNote,
        createNote,
        saveNote,
        deleteNote,
        getMeta,
        saveMeta,
        isReadonly,
        setReadonly,
        rotateTokens,
        setTokenMode,
        adminUpdateNoteContent,
        listNotes,
        purgeDeletedOlderThan,
        purgeAllDeleted,
        getSetting,
        setSetting,
        setHidden,
        markIllegal,
        clearIllegal,
        logActivity,
        listActivity,
        purgeActivityOlderThan,
        hasEditAccess,
        close
    };
}

module.exports = { createMysqlNoteStore, hashToken };
