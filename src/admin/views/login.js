const { escapeHtml } = require('../../markdown');
const { renderPage } = require('./layout');

function renderLogin(basePath, error = '') {
    return renderPage('管理员登录', `
        <h1>管理员登录</h1>
        ${error ? `<p class="danger">${escapeHtml(error)}</p>` : ''}
        <form method="post" action="${basePath}/login">
            <p><label>用户名<br><input name="username" autocomplete="username" required></label></p>
            <p><label>密码<br><input name="password" type="password" autocomplete="current-password" required></label></p>
            <p><button type="submit">登录</button></p>
        </form>
    `);
}

module.exports = { renderLogin };
