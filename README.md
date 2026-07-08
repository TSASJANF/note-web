# Note Web

## 目录

- [项目概述](#项目概述)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [安装与运行](#安装与运行)
- [配置说明](#配置说明)
- [API 文档](#api-文档)
- [数据存储](#数据存储)
- [前端架构](#前端架构)
- [后端架构](#后端架构)
- [安全考虑](#安全考虑)
- [部署](#部署)
- [故障排除](#故障排除)

---

## 项目概述

Note Web 是一个极简的在线记事本应用。用户可以通过 URL 直接访问和编辑笔记，无需注册登录。每个笔记都有一个唯一的短 ID 作为访问地址。

### 核心特性

- **零配置使用**：访问首页自动生成新笔记并重定向
- **自动保存**：定时轮询检测变化并保存
- **多视图**：支持编辑器、Markdown 渲染、HTML 渲染三种视图
- **默认协作**：默认知道链接即可阅读和编辑，可按笔记开启 token 编辑模式
- **只读保护**：管理员可将笔记设为只读状态
- **深色模式**：自动跟随系统主题
- **响应式设计**：适配移动端
- **MySQL 存储**：支持真并发写入，适合多人同时使用

---

## 技术栈

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | >= 24.16.0 | 运行时 |
| Express | 4.18.2 | Web 框架 |
| mysql2 | 3.11.0 | MySQL 异步驱动 |
| nanoid | 3.3.7 | 生成短唯一 ID |
| marked | 12.0.0 | Markdown 解析 |
| marked-highlight | 2.2.1 | 代码高亮插件 |
| highlight.js | 11.11.1 | 代码高亮引擎 |
| mermaid | 11.16.0 | 图表渲染（客户端） |
| sanitize-html | 2.17.5 | Markdown HTML 白名单清洗 |
| crypto.scrypt | Node 内置 | 管理员密码哈希 |

### 前端

| 技术 | 说明 |
|------|------|
| Vanilla JavaScript | 无框架，原生 JS |
| CSS Variables | 主题系统 |
| Fetch API | HTTP 请求 |

### 存储

- **MySQL 8.0**：使用 `mysql2` 异步驱动，支持真并发写入
- **连接池**：默认20个连接，自动管理

---

## 项目结构

```
note-web/
├── server.js                # 后端启动入口
├── src/
│   ├── app.js               # Express 应用和公开 API 路由
│   ├── admin/               # 管理后台模块
│   │   ├── index.js         # 入口，路由注册
│   │   ├── session.js       # Session 管理
│   │   ├── cookies.js       # Cookie 解析
│   │   ├── middleware.js     # 认证/授权中间件
│   │   ├── views/           # HTML 模板
│   │   └── routes/          # 路由处理器
│   ├── storage/
│   │   └── mysql-note-store.js  # MySQL 存储层
│   ├── config.js            # 配置管理
│   ├── auth.js              # 密码哈希
│   ├── middleware.js         # Express 中间件
│   ├── markdown.js          # Markdown 渲染
│   ├── views.js             # HTML 视图构建
│   ├── errors.js            # 自定义错误
│   ├── constants.js         # 常量定义
│   └── utils.js             # 工具函数
├── config.json              # 应用配置
├── package.json             # 依赖和脚本
├── docker-compose.yml       # Docker 编排
├── Dockerfile               # Docker 镜像
├── scripts/
│   ├── hash-password.js     # 密码哈希工具
│   ├── init-mysql.sql       # MySQL 建表脚本
│   └── migrate-sqlite-to-mysql.js  # 数据迁移
├── test/                    # 测试文件
└── public/                  # 前端静态资源
    ├── index.html
    ├── app.js
    ├── style.css
    ├── theme.css
    └── empty.html
```

---

## 安装与运行

### Docker 部署（推荐）

```bash
# 克隆项目
git clone <repository-url>
cd note-web

# 设置环境变量
export MYSQL_ROOT_PASSWORD=your_strong_password
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD_HASH=$(node scripts/hash-password.js "your-admin-password")

# 启动（自动启动 MySQL 和应用）
docker compose up -d

# 查看日志
docker compose logs -f
```

访问 `http://your-server-ip` 即可使用。

### 本地开发

```bash
# 安装依赖
npm install

# 确保 MySQL 已运行，创建数据库
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS noteweb;"

# 设置环境变量
export MYSQL_HOST=localhost
export MYSQL_USER=root
export MYSQL_PASSWORD=your_mysql_password
export MYSQL_DATABASE=noteweb

# 启动
npm start
```

### 访问地址

```
http://localhost              # 首页，自动生成新笔记
http://localhost/{id}         # 编辑指定笔记
http://localhost/{id}.md      # Markdown 渲染视图
http://localhost/{id}.html    # HTML 渲染视图
```

---

## 配置说明

### config.json

```json
{
  "port": 80,
  "saveInterval": 1000,
  "adminPath": "/manage-random-string",
  "adminEntryToken": "long-random-entry-token",
  "universalEditToken": "long-random-edit-token",
  "admin": {
    "username": "admin",
    "passwordHash": "scrypt$..."
  },
  "mysql": {
    "host": "localhost",
    "port": 3306,
    "user": "root",
    "password": "",
    "database": "noteweb",
    "connectionLimit": 20
  }
}
```

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务器端口 | 80 |
| `MYSQL_HOST` | MySQL 主机 | localhost |
| `MYSQL_PORT` | MySQL 端口 | 3306 |
| `MYSQL_USER` | MySQL 用户 | root |
| `MYSQL_PASSWORD` | MySQL 密码 | 空 |
| `MYSQL_DATABASE` | 数据库名 | noteweb |
| `ADMIN_USERNAME` | 管理后台用户名 | 空 |
| `ADMIN_PASSWORD_HASH` | 管理后台密码哈希 | 空 |
| `ADMIN_PATH` | 管理后台隐藏路径 | /admin |
| `ADMIN_ENTRY_TOKEN` | 管理后台入口密钥 | 空 |
| `UNIVERSAL_EDIT_TOKEN` | 通用编辑 token | 空 |

### 生成密码哈希

```bash
node scripts/hash-password.js "your-strong-password"
```

### 权限模型

- 默认笔记无需 token：知道链接即可阅读和编辑
- `readonly` 优先级最高：只读笔记普通用户不可编辑
- `hidden` 笔记对普通用户返回 404，管理员仍可查看
- token 编辑模式按笔记开启，开启后需要 edit token
- 管理员后台可无视所有限制直接管理笔记
- `adminEntryToken` 和 `universalEditToken` 以 SHA-256 哈希存储

---

## API 文档

### 获取配置

```
GET /api/config
```

响应：
```json
{
  "saveInterval": 1000
}
```

### 获取笔记

```
GET /api/:id
```

响应：
```json
{
  "id": "abc123",
  "content": "笔记内容",
  "readonly": false,
  "canEdit": true,
  "editTokenRequired": false,
  "version": 2,
  "deletedAt": null,
  "updatedAt": "2026-07-08T00:00:00.000Z"
}
```

### 保存笔记

```
POST /api/:id
Content-Type: text/plain
If-Match: <version>
```

响应：
```json
{
  "success": true,
  "version": 3,
  "updatedAt": "2026-07-08T00:00:01.000Z"
}
```

错误码：
- `400`：Invalid note ID
- `403`：只读/token 编辑模式下缺少 token
- `409`：Version conflict
- `428`：Missing If-Match version

---

## 数据存储

### MySQL 表结构

**notes 表**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(64) PK | 笔记 ID |
| content | LONGTEXT | 笔记内容 |
| readonly | TINYINT | 只读状态 |
| version | INT | 版本号（乐观锁） |
| edit_token_hash | VARCHAR(64) | edit token SHA-256 哈希 |
| edit_token_required | TINYINT | 是否需要 token 编辑 |
| deleted_at | DATETIME(3) | 空笔记标记时间 |
| creator_ip | VARCHAR(45) | 创建者 IP |
| created_by_admin | TINYINT | 是否管理员创建 |
| hidden | TINYINT | 是否隐藏 |
| illegal_marked_at | DATETIME(3) | 非法标记时间 |
| created_at | DATETIME(3) | 创建时间 |
| updated_at | DATETIME(3) | 更新时间 |

**settings 表**：存储系统配置键值对

**activity_logs 表**：记录操作日志

### 存储逻辑

| 操作 | 说明 |
|------|------|
| 创建笔记 | 首页生成 ID 后写入 MySQL |
| 保存笔记 | 乐观锁版本控制，并发安全 |
| 并发冲突 | 版本不一致返回 409 |
| token 存储 | 数据库仅保存 SHA-256 哈希 |
| 空笔记清理 | 管理后台可配置自动删除期限 |
| 活动日志 | 记录所有操作，默认保留 180 天 |

---

## 前端架构

### app.js 状态管理

```javascript
let lastContent = '';     // 上次保存的内容
let saveInterval = 1000;  // 自动保存间隔
let saveTimer = null;     // setInterval 引用
let isReadonly = false;   // 只读状态
let isSaving = false;     // 保存中标志
let version = 0;          // 服务端版本号
let noteToken = '';       // 编辑 token
```

### 生命周期

1. `init()` → `loadConfig()` → `loadNote()` → `startAutoSave()`
2. 定时器触发 `saveNote()`
3. 保存时携带 `If-Match` 版本号
4. 页面隐藏/卸载时使用 `fetch(..., { keepalive: true })` 保存

---

## 后端架构

### 中间件链

```
1. securityHeaders       # 安全响应头
2. createRateLimiter     # 内存限流（定期清理）
3. 请求日志              # 记录请求耗时
4. validateNoteId        # 验证笔记 ID
5. body parser           # 解析请求体
```

### 路由

```
GET  /                  # 首页，生成新 ID 并重定向
GET  /api/config        # 获取配置
GET  /api/:id           # 获取笔记
POST /api/:id           # 保存笔记
GET  /:id.md            # Markdown 视图
GET  /:id.html          # HTML 视图
GET  /:id               # 编辑器页面
```

### 错误处理

- 400：请求参数错误
- 403：只读/非法笔记/token 无效
- 409：版本冲突
- 428：缺少 If-Match 版本
- 404：路由未匹配/笔记不存在
- 500：服务器内部错误（返回 HTML 或 JSON）

---

## 安全考虑

### XSS 防护

1. ID 验证：正则 `/^[a-zA-Z0-9_-]+$/`，最大 64 字符
2. Markdown 清洗：`sanitize-html` 白名单
3. HTML 视图：iframe sandbox，无脚本执行权限

### 管理后台保护

- 密码使用 `crypto.scrypt` 哈希
- Session 使用 `HttpOnly`、`SameSite=Strict` cookie
- CSRF token 保护所有变更操作
- 入口密钥和编辑 token 以 SHA-256 哈希存储
- Rate limiter 定期清理过期条目

### Docker 安全

- 容器以 `node` 用户运行（非 root）
- MySQL 密码通过环境变量注入

---

## 部署

### Docker Compose（推荐）

```bash
# 设置密码
export MYSQL_ROOT_PASSWORD=your_strong_password
export ADMIN_PASSWORD_HASH=$(node scripts/hash-password.js "your-admin-password")

# 启动
docker compose up -d

# 停止
docker compose down

# 查看日志
docker compose logs -f
```

### Nginx 反向代理

```nginx
server {
    listen 80;
    server_name note.example.com;

    location / {
        proxy_pass http://localhost:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 数据迁移（从 SQLite）

```bash
# 确保 MySQL 已运行
export MYSQL_HOST=localhost
export MYSQL_USER=root
export MYSQL_PASSWORD=your_password
export MYSQL_DATABASE=noteweb

# 执行迁移
node scripts/migrate-sqlite-to-mysql.js /path/to/data
```

---

## 故障排除

### 笔记无法保存

1. 检查 MySQL 连接：`docker compose logs db`
2. 检查数据库是否存在：`mysql -u root -p -e "SHOW DATABASES;"`
3. 查看应用日志：`docker compose logs note-web`

### 页面无法加载

1. 检查端口是否被占用：`lsof -i :80`
2. 检查 Docker 容器状态：`docker compose ps`
3. 检查 `config.json` 格式

### 管理后台 500 错误

1. 检查 `config.json` 是否可写
2. 查看服务器日志中的 `[ERROR]` 信息
3. 确认 MySQL 连接正常

### 深色模式不生效

1. 检查系统主题设置
2. 检查浏览器是否支持 `prefers-color-scheme`
3. 清除浏览器缓存

---

## 测试

```bash
# 运行所有测试
npm test

# 测试文件
test/app.test.js         # 集成测试（26个）
test/auth.test.js        # 认证测试（8个）
test/config.test.js      # 配置测试（10个）
test/cookies.test.js     # Cookie 测试（9个）
test/markdown.test.js    # Markdown 测试（13个）
test/utils.test.js       # 工具函数测试（5个）
test/concurrency.test.js # 并发测试（4个）
```

---

## 版本历史

### v2.0.0

- 迁移到 MySQL 存储引擎
- 全部路由改为 async/await
- admin.js 拆分为模块化结构
- Token 以 SHA-256 哈希存储
- 添加优雅关闭处理
- Docker 容器以非 root 用户运行
- 添加49个新测试（总计75个）

### v1.0.0

- 初始版本（SQLite 存储）

---

## 许可证

MIT License
