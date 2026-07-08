const { escapeHtml } = require('../../markdown');
const { renderPage } = require('./layout');

function renderSettings(config, csrf, basePath, purged = null) {
    return renderPage('系统设置', `
        <p><a href="${basePath}">返回</a></p>
        <h1>系统设置</h1>
        ${purged === null ? '' : `<p>已清理 ${purged} 个空笔记。</p>`}
        <form method="post" action="${basePath}/settings/empty-retention">
            <input type="hidden" name="csrf" value="${csrf}">
            <p><label>管理后台路径（需重启生效）<br><input name="adminPath" value="${escapeHtml(config.adminPath)}" required></label></p>
            <p><label>空笔记自动删除天数<br><input name="emptyNoteRetentionDays" type="number" min="1" max="3650" value="${escapeHtml(String(config.emptyNoteRetentionDays))}" required></label></p>
            <p><label>违规笔记保留天数<br><input name="illegalNoteRetentionDays" type="number" min="1" max="3650" value="${escapeHtml(String(config.illegalNoteRetentionDays))}" required></label></p>
            <p><label>操作日志保留天数<br><input name="activityLogRetentionDays" type="number" min="1" max="3650" value="${escapeHtml(String(config.activityLogRetentionDays))}" required></label></p>
            <p><label>随机 ID 饱和率<br><input name="randomIdSaturationRatio" type="number" min="0.01" max="0.99" step="0.01" value="${escapeHtml(String(config.randomIdSaturationRatio))}" required></label></p>
            <p><label>笔记 ID 黑名单（逗号分隔）<br><input name="noteIdBlacklist" value="${escapeHtml(config.noteIdBlacklist.join(','))}"></label></p>
            <p><button type="submit">保存设置</button></p>
        </form>
        <form method="post" action="${basePath}/settings/purge-empty-now">
            <input type="hidden" name="csrf" value="${csrf}">
            <button type="submit">立即清理过期空笔记</button>
        </form>
        <h2>管理后台入口密钥</h2>
        <p>当前入口密钥不会显示。生成新密钥后请复制保存，确认后才会生效。</p>
        <form method="post" action="${basePath}/settings/admin-entry-token/generate">
            <input type="hidden" name="csrf" value="${csrf}">
            <button type="submit">生成新入口密钥</button>
        </form>
        <h2>通用编辑密钥</h2>
        <p>当前通用编辑密钥不会显示。持有此密钥可编辑所有开启了 Token 编辑模式的笔记。</p>
        <form method="post" action="${basePath}/settings/universal-edit-token/generate">
            <input type="hidden" name="csrf" value="${csrf}">
            <button type="submit">生成新通用编辑密钥</button>
        </form>
    `);
}

function renderPendingEntryToken(token, csrf, basePath) {
    return renderPage('确认入口密钥', `
        <p><a href="${basePath}/settings">返回</a></p>
        <h1>新管理后台入口密钥</h1>
        <p class="danger">请立即复制此密钥。确认后将无法再次查看。</p>
        <div class="token">${escapeHtml(token)}</div>
        <form method="post" action="${basePath}/settings/admin-entry-token/confirm">
            <input type="hidden" name="csrf" value="${csrf}">
            <button type="submit">确认应用新密钥</button>
        </form>
    `);
}

function renderPendingUniversalEditToken(token, csrf, basePath) {
    return renderPage('确认通用编辑密钥', `
        <p><a href="${basePath}/settings">返回</a></p>
        <h1>新通用编辑密钥</h1>
        <p class="danger">请立即复制此密钥。持有此密钥可编辑所有开启了 Token 编辑模式的笔记。</p>
        <div class="token">${escapeHtml(token)}</div>
        <form method="post" action="${basePath}/settings/universal-edit-token/confirm">
            <input type="hidden" name="csrf" value="${csrf}">
            <button type="submit">确认应用新通用编辑密钥</button>
        </form>
    `);
}

module.exports = { renderSettings, renderPendingEntryToken, renderPendingUniversalEditToken };
