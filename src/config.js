const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function hashConfigToken(token) {
    if (!token) return '';
    return `sha256:${crypto.createHash('sha256').update(token, 'utf-8').digest('hex')}`;
}

function verifyConfigToken(token, storedValue) {
    if (!token || !storedValue) return false;
    if (storedValue.startsWith('sha256:')) {
        const hash = crypto.createHash('sha256').update(token, 'utf-8').digest('hex');
        return hash === storedValue.slice(7);
    }
    return token === storedValue;
}

const DEFAULT_CONFIG = {
    port: 2980,
    saveInterval: 1000,
    bodySizeLimit: '5mb',
    rateLimitWindowMs: 60_000,
    rateLimitMaxRequests: 300,
    adminUsername: process.env.ADMIN_USERNAME || '',
    adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '',
    adminPath: process.env.ADMIN_PATH || '/admin',
    adminEntryToken: process.env.ADMIN_ENTRY_TOKEN || '',
    universalEditToken: process.env.UNIVERSAL_EDIT_TOKEN || '',
    randomIdSaturationRatio: 0.6,
    noteIdBlacklist: ['api', 'admin', 'vendor', 'theme', 'style', 'app', 'empty', 'markdown-view', 'markdown'],
    emptyNoteRetentionDays: 30,
    illegalNoteRetentionDays: 365,
    activityLogRetentionDays: 180,
    trustProxy: false
};

function parsePositiveInteger(value, name, { min, max }) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        throw new Error(`${name} must be an integer between ${min} and ${max}`);
    }
    return parsed;
}

function loadConfig(configPath = path.join(__dirname, '..', 'config.json')) {
    let fileConfig = {};
    if (fs.existsSync(configPath)) {
        try {
            fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        } catch (err) {
            console.error(`[CONFIG] Failed to parse ${configPath}: ${err.message}. Using defaults.`);
            fileConfig = {};
        }
    }

    const raw = { ...DEFAULT_CONFIG, ...fileConfig };
    const port = parsePositiveInteger(process.env.PORT || raw.port, 'port', { min: 1, max: 65535 });
    const saveInterval = parsePositiveInteger(raw.saveInterval, 'saveInterval', { min: 100, max: 60_000 });
    const rateLimitWindowMs = parsePositiveInteger(raw.rateLimitWindowMs, 'rateLimitWindowMs', { min: 1000, max: 3_600_000 });
    const rateLimitMaxRequests = parsePositiveInteger(raw.rateLimitMaxRequests, 'rateLimitMaxRequests', { min: 1, max: 100_000 });
    const emptyNoteRetentionDays = parsePositiveInteger(raw.emptyNoteRetentionDays ?? DEFAULT_CONFIG.emptyNoteRetentionDays, 'emptyNoteRetentionDays', { min: 1, max: 3650 });
    const illegalNoteRetentionDays = parsePositiveInteger(raw.illegalNoteRetentionDays ?? DEFAULT_CONFIG.illegalNoteRetentionDays, 'illegalNoteRetentionDays', { min: 1, max: 3650 });
    const activityLogRetentionDays = parsePositiveInteger(raw.activityLogRetentionDays ?? DEFAULT_CONFIG.activityLogRetentionDays, 'activityLogRetentionDays', { min: 1, max: 3650 });
    const randomIdSaturationRatio = Number(raw.randomIdSaturationRatio ?? DEFAULT_CONFIG.randomIdSaturationRatio);
    if (!Number.isFinite(randomIdSaturationRatio) || randomIdSaturationRatio <= 0 || randomIdSaturationRatio >= 1) {
        throw new Error('randomIdSaturationRatio must be greater than 0 and less than 1');
    }

    const adminPath = process.env.ADMIN_PATH || raw.adminPath || DEFAULT_CONFIG.adminPath;
    if (typeof adminPath !== 'string' || !adminPath.startsWith('/') || adminPath.length < 2 || adminPath.includes('?') || adminPath.includes('#')) {
        throw new Error('adminPath must be an absolute URL path like /manage-secret');
    }
    const adminPathId = adminPath.split('/').filter(Boolean)[0];
    const configuredBlacklist = Array.isArray(raw.noteIdBlacklist) ? raw.noteIdBlacklist : DEFAULT_CONFIG.noteIdBlacklist;
    const noteIdBlacklist = Array.from(new Set([...configuredBlacklist, adminPathId].filter(Boolean)));

    return {
        ...raw,
        port,
        saveInterval,
        rateLimitWindowMs,
        rateLimitMaxRequests,
        emptyNoteRetentionDays,
        illegalNoteRetentionDays,
        activityLogRetentionDays,
        trustProxy: raw.trustProxy === true,
        randomIdSaturationRatio,
        noteIdBlacklist,
        adminUsername: process.env.ADMIN_USERNAME || raw.adminUsername || raw.admin?.username || '',
        adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || raw.adminPasswordHash || raw.admin?.passwordHash || '',
        adminPath,
        adminEntryToken: process.env.ADMIN_ENTRY_TOKEN || raw.adminEntryToken || raw.admin?.entryToken || '',
        universalEditToken: process.env.UNIVERSAL_EDIT_TOKEN || raw.universalEditToken || '',
        configPath,
        mysql: {
            host: process.env.MYSQL_HOST || raw.mysql?.host || 'localhost',
            port: Number(process.env.MYSQL_PORT || raw.mysql?.port || 3306),
            user: process.env.MYSQL_USER || raw.mysql?.user || 'root',
            password: process.env.MYSQL_PASSWORD || raw.mysql?.password || '',
            database: process.env.MYSQL_DATABASE || raw.mysql?.database || 'noteweb',
            connectionLimit: Number(raw.mysql?.connectionLimit || 20)
        }
    };
}

function saveConfig(configPath, config) {
    const output = {
        port: config.port,
        saveInterval: config.saveInterval,
        randomIdSaturationRatio: config.randomIdSaturationRatio,
        noteIdBlacklist: config.noteIdBlacklist,
        emptyNoteRetentionDays: config.emptyNoteRetentionDays,
        illegalNoteRetentionDays: config.illegalNoteRetentionDays,
        activityLogRetentionDays: config.activityLogRetentionDays,
        trustProxy: config.trustProxy === true,
        adminPath: config.adminPath,
        adminEntryToken: config.adminEntryToken,
        universalEditToken: config.universalEditToken,
        admin: {
            username: config.adminUsername,
            passwordHash: config.adminPasswordHash
        }
    };
    const data = `${JSON.stringify(output, null, 2)}\n`;
    const tempPath = `${configPath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, data, 'utf-8');
    try {
        fs.renameSync(tempPath, configPath);
    } catch (renameErr) {
        let backup = null;
        try {
            backup = fs.readFileSync(configPath, 'utf-8');
        } catch {}
        try {
            fs.copyFileSync(tempPath, configPath);
        } catch (copyErr) {
            if (backup !== null) {
                try { fs.writeFileSync(configPath, backup, 'utf-8'); } catch {}
            }
            throw copyErr;
        } finally {
            try { fs.unlinkSync(tempPath); } catch {}
        }
    }
}

module.exports = { loadConfig, saveConfig, hashConfigToken, verifyConfigToken };
