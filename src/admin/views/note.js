const { escapeHtml } = require('../../markdown');
const { renderPage, formatBeijingTime } = require('./layout');

function renderNote(note, csrf, basePath, rotatedTokens = null) {
    const tokenBlock = rotatedTokens ? `
        <h2>新 Token</h2>
        <p class="danger">请立即复制此 Token。系统仅存储哈希值，无法再次查看。</p>
        <div class="token"><strong>笔记编辑 Token：</strong><br>${escapeHtml(rotatedTokens.editToken)}</div>
    ` : '';

    return renderPage(`笔记 ${note.id}`, `
        <p><a href="${basePath}">返回</a></p>
        <h1>${escapeHtml(note.id)}</h1>
        <p class="muted">版本 ${note.version}，更新于 ${escapeHtml(formatBeijingTime(note.updatedAt))}${note.deletedAt ? `，自 ${escapeHtml(formatBeijingTime(note.deletedAt))} 起为空笔记` : ''}</p>
        <p class="muted">Token 编辑模式：${note.editTokenRequired ? '已开启' : '已关闭'}</p>
        ${tokenBlock}
        <div class="actions">
            <form method="post" action="${basePath}/notes/${encodeURIComponent(note.id)}/readonly">
                <input type="hidden" name="csrf" value="${csrf}">
                <input type="hidden" name="readonly" value="${note.readonly ? 'false' : 'true'}">
                <button type="submit">${note.readonly ? '取消只读' : '设为只读'}</button>
            </form>
            <form method="post" action="${basePath}/notes/${encodeURIComponent(note.id)}/rotate-tokens">
                <input type="hidden" name="csrf" value="${csrf}">
                <button type="submit">轮换笔记编辑 Token</button>
            </form>
            <form method="post" action="${basePath}/notes/${encodeURIComponent(note.id)}/token-mode">
                <input type="hidden" name="csrf" value="${csrf}">
                <input type="hidden" name="required" value="${note.editTokenRequired ? 'false' : 'true'}">
                <button type="submit">${note.editTokenRequired ? '关闭 Token 编辑模式' : '开启 Token 编辑模式'}</button>
            </form>
            <form method="post" action="${basePath}/notes/${encodeURIComponent(note.id)}/hidden">
                <input type="hidden" name="csrf" value="${csrf}">
                <input type="hidden" name="hidden" value="${note.hidden ? 'false' : 'true'}">
                <button type="submit">${note.hidden ? '取消隐藏' : '隐藏笔记'}</button>
            </form>
            <form method="post" action="${basePath}/notes/${encodeURIComponent(note.id)}/delete" onsubmit="return confirm('确定要永久删除此笔记吗？')">
                <input type="hidden" name="csrf" value="${csrf}">
                <button type="submit">删除笔记</button>
            </form>
        </div>
        <h2>内容</h2>
        <form method="post" action="${basePath}/notes/${encodeURIComponent(note.id)}/content">
            <input type="hidden" name="csrf" value="${csrf}">
            <textarea name="content">${escapeHtml(note.content)}</textarea>
            <p><button type="submit">以管理员身份保存内容</button></p>
        </form>
    `);
}

module.exports = { renderNote };
