# AstroPropose 天文观测提案管理系统

> **English**: [README.md](README.md)

## 项目简介

AstroPropose 是一个通用且可定制的天文观测提案管理框架，基于研究论文设计实现。该系统提供了完整的提案生命周期管理，包括用户认证、工作流设计、提案提交和审核等功能。

## 主要特性

- **用户认证与授权**: 基于JWT的认证系统，支持角色基础访问控制(RBAC)
- **可视化工作流编辑器**: 拖拽式工作流设计，支持自定义提案审批流程
- **动态表单系统**: 基于JSON配置的动态表单生成和验证
- **提案类型管理**: 灵活配置不同类型的观测提案
- **提案生命周期管理**: 完整的提案提交、审核、状态跟踪流程
- **现代化UI**: 基于Next.js和Tailwind CSS的响应式界面

## 技术栈

### 后端
- **框架**: Flask 2.2.2
- **数据库**: PostgreSQL (远程服务器)
- **ORM**: SQLAlchemy 1.4.39
- **认证**: PyJWT 2.4.0
- **包管理**: [uv](https://github.com/astral-sh/uv)

### 前端
- **框架**: Next.js 13.4.12
- **UI库**: React 18.2.0
- **样式**: Tailwind CSS 3.3.3
- **工作流**: XyFlow (@xyflow/react) 12.0.0+

## 系统要求

- Python 3.12+
- [uv](https://github.com/astral-sh/uv) ≥ 0.5.0
- Node.js v18+
- PostgreSQL 服务器访问权限

## 快速开始

### 1. 克隆项目
```bash
git clone <repository-url>
cd src
```

### 2. 后端设置（uv）

#### 环境准备与依赖安装
```bash
cd backend
uv sync
```

上述命令会下载依赖并创建 uv 托管的 `.venv/`。后续可通过 `uv run ...` 直接执行命令，也可手动激活 `.venv`。

#### 环境变量配置
复制环境变量模板文件并配置您的设置：
```bash
cp env.example .env
# 编辑 .env 文件，配置数据库连接和其他设置
```

#### 数据库配置
确保远程PostgreSQL服务器可访问，数据库 `eops_framework_dev` 已创建。

#### 数据库迁移
```bash
export FLASK_APP=run.py
flask db upgrade
```

#### 初始化数据
```bash
flask seed
```

#### 启动后端服务
```bash
uv run flask run --port 5001
```

后端API将在 `http://localhost:5001` 可用。

### 3. 前端设置

#### 安装依赖
```bash
cd frontend
npm install
```

#### 启动开发服务器
```bash
npm run dev
```

前端应用将在 `http://localhost:3000` 可用。

## 使用指南

### 首次访问
1. 访问 `http://localhost:3000`
2. 使用默认管理员账户登录：
   - 用户名: `admin`
   - 密码: `password`

### 主要功能

#### 工作流编辑器
- 访问 `/admin/workflows` 进行工作流设计
- 使用拖拽式界面创建和编辑工作流
- 支持节点连接和状态配置

#### 提案管理
- 访问 `/proposals/new` 创建新提案
- 选择提案类型并填写表单
- 跟踪提案状态和审核进度

#### 用户管理
- 用户注册和登录
- 角色分配和权限管理
- 个人仪表板

## 项目结构

```
src/
├── backend/                 # Flask后端应用
│   ├── app/
│   │   ├── api/            # RESTful API端点
│   │   │   ├── auth.py     # 认证相关API
│   │   │   ├── proposals.py # 提案管理API
│   │   │   └── workflows.py # 工作流管理API
│   │   ├── models/         # 数据库模型
│   │   └── core/           # 核心业务逻辑
│   ├── migrations/         # 数据库迁移文件
│   └── pyproject.toml      # 使用 uv 管理的 Python 依赖
├── frontend/               # Next.js前端应用
│   ├── app/               # 页面组件
│   │   ├── admin/         # 管理员页面
│   │   ├── proposals/     # 提案相关页面
│   │   └── dashboard/     # 用户仪表板
│   ├── components/        # 可复用组件
│   └── lib/              # 工具库
└── README.md             # 项目文档
```

## API文档

### 认证端点
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/register` - 用户注册
- `GET /api/auth/profile` - 获取用户信息

### 提案端点
- `GET /api/proposals` - 获取提案列表
- `POST /api/proposals` - 创建新提案
- `GET /api/proposals/<id>` - 获取提案详情
- `PUT /api/proposals/<id>` - 更新提案

### 工作流端点
- `GET /api/workflows` - 获取工作流列表
- `POST /api/workflows` - 创建工作流
- `PUT /api/workflows/<id>` - 更新工作流

## 开发说明

### 数据库模型
- **User**: 用户信息管理
- **Role**: 角色定义
- **Proposal**: 提案数据
- **Workflow**: 工作流定义
- **FormTemplate**: 表单模板

### 前端组件
- **WorkflowEditor**: 可视化工作流编辑器
- **Navbar**: 导航栏组件
- **动态表单**: 基于配置的表单生成器

## 安全性说明

### 环境变量和敏感信息
- 确保 `.env` 文件已添加到 `.gitignore` 中
- 不要在代码中硬编码数据库密码、API密钥等敏感信息
- 使用环境变量来管理配置信息
- 定期更新密钥和密码

### 生产环境部署
- 使用强密码和密钥
- 启用HTTPS
- 配置适当的CORS策略
- 设置安全的会话配置

## 故障排除

### 常见问题

1. **数据库连接失败**
   - 检查PostgreSQL服务器状态
   - 验证数据库连接字符串
   - 确认网络连接

2. **前端依赖安装失败**
   - 清除node_modules并重新安装
   - 检查Node.js版本兼容性

3. **API请求失败**
   - 确认后端服务正在运行
   - 检查CORS配置
   - 验证JWT令牌有效性

## 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建Pull Request

## 引用

如果你在科研工作或软件发布中使用 AstroPropose，请引用：

```bibtex
@article{xu2026managing,
  title={Managing astronomical observing proposals with AstroPropose: A customizable framework applied to the Einstein Probe mission},
  author={Xu, Yunfei and Zhang, Zhen and Mi, Linying and Hu, Jingwei and Li, Shanshan and Li, Dongyue and Jin, Chichuan and Chen, Lang and Fan, Dongwei and Li, Changhua and others},
  journal={Astronomy and Computing},
  pages={101080},
}
```

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 联系方式

如有问题或建议，请通过以下方式联系：
- 项目Issues: [GitHub Issues](https://github.com/xx70235/AstroPropose/issues)
- 邮箱: xuyf@nao.cas.cn
