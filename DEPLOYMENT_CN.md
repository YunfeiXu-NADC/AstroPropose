# 鸿蒙计划 RPS 部署说明

本交付包包含 Next.js 前端、Flask 后端、数据库迁移、DSL 流程预设和一份演示数据库。

## 1. 环境要求

- Linux 服务器（推荐 Ubuntu 22.04 或更高版本）
- Python 3.12
- uv 0.5 或更高版本
- Node.js 20 LTS 或更高版本
- npm 10 或更高版本

## 2. 启动后端

```bash
cd backend
uv sync --frozen

# 演示部署：把下面路径改为服务器上的实际绝对路径
export DATABASE_URL="sqlite:////opt/dsl-rps/backend/astropropose-demo.db"
export SECRET_KEY="请替换为足够长的随机字符串"

uv run flask --app run.py run --host 0.0.0.0 --port 5001
```

验证后端：访问 `http://服务器地址:5001/ping`，应返回 `pong!`。

## 3. 构建并启动前端

`NEXT_PUBLIC_API_URL` 会在构建时写入前端，请替换为用户浏览器能够访问的后端地址。

```bash
cd frontend
npm ci
NEXT_PUBLIC_API_URL="http://服务器地址:5001" npm run build
npm run start -- -H 0.0.0.0 -p 3000
```

访问 `http://服务器地址:3000`。

## 4. 初始演示账户

- 用户名：`admin`
- 初始密码：`password`

首次登录后请立即在“账户与密码”中修改密码。

## 5. 正式部署注意事项

- 演示数据库适合内部验收，不适合作为多人生产数据库；正式环境请配置 PostgreSQL，并执行数据库迁移。
- 后端应由生产级 WSGI 服务托管，前端和后端建议通过 Nginx 统一配置 HTTPS 与反向代理。
- 不要提交或传播真实的 `.env`、数据库口令、JWT 密钥和邮件凭据。
- 上线前应限制 CORS 来源，并关闭调试模式。
- 备份数据时应同时保存数据库、上传附件和环境配置。

## 6. 交付包内容

- `frontend/`：前端源代码及锁定依赖版本
- `backend/`：后端源代码、迁移文件及演示数据库
- `scripts/`：界面回归检查脚本
- `docs/`：原项目设计与测试文档
- `env.deploy.example`：部署环境变量示例

