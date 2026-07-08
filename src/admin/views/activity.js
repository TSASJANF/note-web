const { escapeHtml } = require('../../markdown');
const { renderPage, formatBeijingTime } = require('./layout');

function renderActivity(rows, csrf, basePath) {
    return renderPage('操作日志', `
        <p><a href="${basePath}">返回</a></p>
        <h1>操作日志</h1>
        <table>
            <thead><tr><th>时间</th><th>IP</th><th>笔记</th><th>操作</th><th>管理员</th><th>元数据</th></tr></thead>
            <tbody>${rows.map((row) => `
                <tr>
                    <td>${escapeHtml(formatBeijingTime(row.occurred_at))}</td>
                    <td>${escapeHtml(row.ip)}</td>
                    <td>${row.note_id ? escapeHtml(row.note_id) : '-'}</td>
                    <td>${escapeHtml(row.action)}</td>
                    <td>${row.is_admin === 1 ? '是' : '否'}</td>
                    <td>${row.metadata ? escapeHtml(row.metadata) : '-'}</td>
                </tr>
            `).join('')}</tbody>
        </table>
    `);
}

module.exports = { renderActivity };
