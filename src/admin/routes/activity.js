const { requireAdmin } = require('../middleware');
const { renderActivity } = require('../views/activity');

function registerActivityRoutes(app, { store, sessions, basePath, loginPath }) {
    app.get(`${basePath}/activity`, requireAdmin(sessions, loginPath), async (req, res) => {
        res.send(renderActivity(await store.listActivity({ limit: 500 }), req.adminSession.session.csrf, basePath));
    });
}

module.exports = { registerActivityRoutes };
