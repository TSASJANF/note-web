const { escapeHtml } = require('../../markdown');
const { renderPage, formatDuration, formatBeijingTime } = require('./layout');

function renderList(notes, csrf, basePath) {
    const rows = notes.map((note) => `
        <tr>
            <td><a href="${basePath}/notes/${encodeURIComponent(note.id)}">${escapeHtml(note.id)}</a></td>
            <td>${note.content.length}</td>
            <td>${note.readonly ? '是' : '否'}</td>
            <td>${note.editTokenRequired ? '是' : '否'}</td>
            <td>${note.hidden ? '是' : '否'}</td>
            <td>${note.version}</td>
            <td>${note.deletedAt ? escapeHtml(formatDuration(Date.now() - Date.parse(note.deletedAt))) : '-'}</td>
            <td>${escapeHtml(formatBeijingTime(note.updatedAt))}</td>
        </tr>
    `).join('');

    return renderPage('笔记管理', `
        <div class="bar">
            <h1>笔记管理</h1>
            <form method="post" action="${basePath}/logout"><input type="hidden" name="csrf" value="${csrf}"><button type="submit">退出登录</button></form>
        </div>
        <p><a href="${basePath}">全部笔记</a> | <a href="${basePath}?filter=empty">空笔记</a> | <a href="${basePath}?filter=illegal">违规笔记</a> | <a href="${basePath}/activity">操作日志</a> | <a href="${basePath}/settings">系统设置</a></p>
        <h2>创建只读笔记</h2>
        <form method="post" action="${basePath}/notes/create" class="actions">
            <input type="hidden" name="csrf" value="${csrf}">
            <input name="id" placeholder="笔记 ID" maxlength="64" required>
            <button type="submit">创建只读笔记</button>
        </form>
        <table>
            <thead><tr><th>ID</th><th>字节数</th><th>只读</th><th>Token 编辑模式</th><th>已隐藏</th><th>版本</th><th>空笔记时长</th><th>更新时间</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `);
}

module.exports = { renderList };
