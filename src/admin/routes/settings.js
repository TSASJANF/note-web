const crypto = require('crypto');
const { saveConfig, hashConfigToken } = require('../../config');
const { requireAdmin, requireCsrf } = require('../middleware');
const { renderSettings, renderPendingEntryToken, renderPendingUniversalEditToken } = require('../views/settings');

function registerSettingsRoutes(app, { config, store, sessions, parseForm, basePath, loginPath }) {
    app.get(`${basePath}/settings`, requireAdmin(sessions, loginPath), (req, res) => {
        res.send(renderSettings(config, req.adminSession.session.csrf, basePath));
    });

    app.post(`${basePath}/settings/empty-retention`, parseForm, requireAdmin(sessions, loginPath), requireCsrf, (req, res) => {
        config.emptyNoteRetentionDays = Math.min(Math.max(Number(req.body.emptyNoteRetentionDays) || config.emptyNoteRetentionDays, 1), 3650);
        config.illegalNoteRetentionDays = Math.min(Math.max(Number(req.body.illegalNoteRetentionDays) || config.illegalNoteRetentionDays, 1), 3650);
        config.activityLogRetentionDays = Math.min(Math.max(Number(req.body.activityLogRetentionDays) || config.activityLogRetentionDays, 1), 3650);
        const ratio = Number(req.body.randomIdSaturationRatio);
        if (Number.isFinite(ratio) && ratio > 0 && ratio < 1) {
            config.randomIdSaturationRatio = ratio;
        }
        const parseAdminPath = String(req.body.adminPath || '').trim();
        if (!parseAdminPath.startsWith('/') || parseAdminPath.length < 2 || parseAdminPath.includes('?') || parseAdminPath.includes('#')) {
            return res.status(400).send('无效的管理后台路径');
        }
        config.adminPath = parseAdminPath;
        const adminPathId = parseAdminPath.split('/').filter(Boolean)[0];
        config.noteIdBlacklist = Array.from(new Set([...String(req.body.noteIdBlacklist || '').split(',').map((item) => item.trim()).filter(Boolean), adminPathId].filter(Boolean)));
        saveConfig(config.configPath, config);
        res.redirect(303, `${basePath}/settings`);
    });

    app.post(`${basePath}/settings/purge-empty-now`, parseForm, requireAdmin(sessions, loginPath), requireCsrf, async (req, res) => {
        const purged = await store.purgeAllDeleted();
        res.send(renderSettings(config, req.adminSession.session.csrf, basePath, purged));
    });

    app.post(`${basePath}/settings/admin-entry-token/generate`, parseForm, requireAdmin(sessions, loginPath), requireCsrf, (req, res) => {
        const token = crypto.randomBytes(32).toString('base64url');
        req.adminSession.session.pendingEntryToken = token;
        res.send(renderPendingEntryToken(token, req.adminSession.session.csrf, basePath));
    });

    app.post(`${basePath}/settings/admin-entry-token/confirm`, parseForm, requireAdmin(sessions, loginPath), requireCsrf, (req, res) => {
        const token = req.adminSession.session.pendingEntryToken;
        if (!token) {
            return res.status(400).send('没有待确认的入口密钥');
        }
        config.adminEntryToken = hashConfigToken(token);
        req.adminSession.session.pendingEntryToken = null;
        saveConfig(config.configPath, config);
        res.redirect(303, `${basePath}/settings`);
    });

    app.post(`${basePath}/settings/universal-edit-token/generate`, parseForm, requireAdmin(sessions, loginPath), requireCsrf, (req, res) => {
        const token = crypto.randomBytes(32).toString('base64url');
        req.adminSession.session.pendingUniversalEditToken = token;
        res.send(renderPendingUniversalEditToken(token, req.adminSession.session.csrf, basePath));
    });

    app.post(`${basePath}/settings/universal-edit-token/confirm`, parseForm, requireAdmin(sessions, loginPath), requireCsrf, (req, res) => {
        const token = req.adminSession.session.pendingUniversalEditToken;
        if (!token) {
            return res.status(400).send('没有待确认的通用编辑密钥');
        }
        config.universalEditToken = hashConfigToken(token);
        req.adminSession.session.pendingUniversalEditToken = null;
        saveConfig(config.configPath, config);
        res.redirect(303, `${basePath}/settings`);
    });
}

module.exports = { registerSettingsRoutes };
