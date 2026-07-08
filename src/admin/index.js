const { createSessionStore } = require('./session');
const { parseCookies } = require('./cookies');
const { ENTRY_COOKIE, setEntryCookie } = require('./middleware');
const { verifyConfigToken } = require('../config');
const { registerAuthRoutes } = require('./routes/auth');
const { registerNoteRoutes } = require('./routes/notes');
const { registerSettingsRoutes } = require('./routes/settings');
const { registerActivityRoutes } = require('./routes/activity');

function registerAdminRoutes(app, { config, store, express }) {
    const sessions = createSessionStore();
    const failedLogins = new Map();
    const parseForm = express.urlencoded({ extended: false, limit: '32kb' });
    const basePath = config.adminPath || '/admin';
    const loginPath = `${basePath}/login`;

    app.use(basePath, (req, res, next) => {
        res.set('Cache-Control', 'no-store');

        if (!config.adminEntryToken) {
            return next();
        }

        const cookies = parseCookies(req.get('Cookie'));
        if (cookies[ENTRY_COOKIE] === '1') {
            return next();
        }

        if (req.query.entry && verifyConfigToken(req.query.entry, config.adminEntryToken)) {
            setEntryCookie(res, basePath);
            return res.redirect(303, loginPath);
        }

        return res.status(404).send('页面不存在');
    });

    if (basePath !== '/admin') {
        app.use('/admin', (req, res) => {
            res.status(404).send('Not found');
        });
    }

    app.use(basePath, (req, res, next) => {
        next();
    });

    const routeContext = { config, store, sessions, failedLogins, parseForm, basePath, loginPath };

    registerAuthRoutes(app, routeContext);
    registerNoteRoutes(app, routeContext);
    registerSettingsRoutes(app, routeContext);
    registerActivityRoutes(app, routeContext);
}

module.exports = { registerAdminRoutes, createSessionStore, parseCookies };
