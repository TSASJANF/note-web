const { verifyPassword } = require('../../auth');
const { getClientIp } = require('../../utils');
const { isAdminEnabled, setSessionCookie, clearSessionCookie } = require('../middleware');
const { renderLogin } = require('../views/login');
const { renderPage } = require('../views/layout');

function registerAuthRoutes(app, { config, sessions, failedLogins, parseForm, basePath, loginPath }) {
    app.get(`${basePath}/login`, (req, res) => {
        if (!isAdminEnabled(config)) {
            return res.status(503).send(renderPage('管理后台已禁用', '<h1>管理后台已禁用</h1><p>请在配置文件或环境变量中设置 admin.username 和 admin.passwordHash。</p>'));
        }
        res.send(renderLogin(basePath));
    });

    app.post(`${basePath}/login`, parseForm, (req, res) => {
        if (!isAdminEnabled(config)) {
            return res.status(503).send('管理后台已禁用');
        }
        const key = getClientIp(req);
        const failed = failedLogins.get(key);
        if (failed && failed.resetAt <= Date.now()) {
            failedLogins.delete(key);
        }
        if (failed && failed.count >= 5 && failed.resetAt > Date.now()) {
            return res.status(429).send(renderLogin(basePath, '登录失败次数过多，请稍后再试。'));
        }

        const usernameOk = req.body?.username === config.adminUsername;
        const passwordOk = verifyPassword(req.body?.password, config.adminPasswordHash);
        if (!usernameOk || !passwordOk) {
            const current = failed && failed.resetAt > Date.now() ? failed : { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
            current.count += 1;
            failedLogins.set(key, current);
            return res.status(403).send(renderLogin(basePath, '用户名或密码错误'));
        }

        failedLogins.delete(key);
        const session = sessions.create();
        setSessionCookie(res, session.id, basePath);
        res.redirect(303, basePath);
    });

    app.post(`${basePath}/logout`, parseForm, require('../middleware').requireAdmin(sessions, loginPath), require('../middleware').requireCsrf, (req, res) => {
        sessions.remove(req.adminSession.sessionId);
        clearSessionCookie(res, basePath);
        res.redirect(303, loginPath);
    });
}

module.exports = { registerAuthRoutes };
