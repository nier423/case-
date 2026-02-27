# 🔍 Case 质量检测工具

> 一款基于 AI 的网页功能自动化检测工具，专为千问生成的 Case（网页应用）设计

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18+-61DAFB?logo=react&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-1.40+-2EAD33?logo=playwright&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## ✨ 功能特性

| 特性 | 说明 |
|------|------|
| 🤖 **AI 驱动** | 集成阿里云百炼 API，自动识别功能点并判断执行结果 |
| 🎯 **L1-L4 四级检测** | 从元素存在性到视觉布局的完整质量检测 |
| 📊 **程序化优先** | 功能点识别和 L3 检测均支持纯程序化模式，无需依赖 AI |
| 🖼️ **L4 视觉检测** | 检测元素遮挡、图表裁切、图例重叠、文字截断等布局问题 |
| 🚀 **并发控制** | 任务队列管理，支持批量检测，防止资源耗尽 |
| 📝 **详细报告** | 生成结构化检测报告，包含通过率、失败原因、修复建议 |
| 🌐 **多种输入** | 支持 URL 链接、HTML 代码粘贴、文件上传（支持批量） |

---

## 🛠️ 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                      前端 (React + Vite)                     │
│                    http://localhost:3000                     │
└─────────────────────────────┬───────────────────────────────┘
                              │ API 请求
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   后端 (Node.js + Express)                   │
│                    http://localhost:3001                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Playwright  │  │  qwen-plus  │  │   qwen-vl-plus      │  │
│  │ 浏览器自动化 │  │  代码分析    │  │   AI 辅助判断        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 检测流程

```
Step 1                    Step 2                    Step 3                    Step 4                    Step 5
┌──────────┐              ┌──────────┐              ┌──────────┐              ┌──────────┐              ┌──────────┐
│ 加载 Case │  ──────▶    │ AI 识别   │  ──────▶    │ L3 检测   │  ──────▶    │ L4 布局   │  ──────▶    │ 生成报告  │
│          │              │ 功能点    │              │ 逐一执行  │              │ 质量检测  │              │          │
│ Playwright│              │ qwen-plus│              │ 程序化+AI │              │ 遮挡/截断 │              │ 汇总结果  │
└──────────┘              └──────────┘              └──────────┘              └──────────┘              └──────────┘
```

### 检测层级

| 层级 | 名称 | 检测内容 | 执行方 |
|------|------|---------|--------|
| **L1** | 存在性检测 | 元素是否存在且可见 | Playwright |
| **L2** | 可交互性检测 | 元素是否可点击、未被禁用 | Playwright |
| **L3** | 功能性检测 | 点击后功能是否正常工作 | 程序化 + AI 辅助 |
| **L4** | 布局质量检测 | 文字是否被遮挡/截断/溢出 | 程序化 + AI 辅助 |

### L3 程序化检测逻辑

```
点击按钮
    │
    ▼
收集程序化证据
├─ 网络请求列表
├─ 弹窗/Toast 内容
├─ URL 变化
└─ 下载事件
    │
    ▼
程序化判断
├─ 分享：检测弹窗/剪贴板
├─ 下载：检测下载请求
├─ 跳转：检测 URL 变化
└─ 提交：检测 POST 请求
    │
    ├─ 确定 → 直接返回结果
    │
    └─ 无法确定 → 调用 AI 辅助判断
```

### L4 布局质量检测逻辑

```
页面加载完成
    │
    ▼
程序化布局检测（阶段1：~100ms）
├─ checkTextTruncation()    → 检测文字截断
├─ checkElementOverlap()    → 检测元素遮挡（多点采样）
├─ checkOverflow()          → 检测内容溢出
├─ checkChartCompleteness() → 检测图表完整性（SVG/Canvas裁切）
├─ checkBoundaryOverflow()  → 检测边界溢出
└─ 检测图例与图表重叠
    │
    ▼
视觉模型分析（阶段2：可选，~3s）
└─ qwen-vl-plus 深度分析截图
   ├─ 发现程序化漏检的问题
   └─ 检测文字乱码、布局美观性
    │
    ▼
问题分类
├─ 🔒 元素遮挡         → severity: high
├─ 📊 图例重叠图表      → severity: high
├─ ✂️ 图表裁切         → severity: high
├─ 📝 文字截断         → severity: medium
├─ 📐 图表变形         → severity: medium
└─ ↔️ 内容溢出         → severity: low
    │
    ▼
汇总问题列表 → 生成修复建议
```

---

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/nier423/case-.git
cd case-
```

### 2. 安装依赖

```bash
# 安装后端依赖
cd backend
npm install

# 安装 Playwright 浏览器
npx playwright install

# 安装前端依赖
cd ../frontend
npm install
```

### 3. 配置环境变量

在 `backend` 目录创建 `.env` 文件：

```env
# AI API 配置
DASHSCOPE_API_KEY=your_api_key_here
QWEN_CODER_MODEL=qwen-plus
QWEN_VL_MODEL=qwen-vl-plus

# 服务配置
PORT=3001

# ===== 增强功能配置 =====

# 最大并发检测任务数（建议 2-5，取决于服务器内存）
MAX_CONCURRENT_TASKS=3

# 功能点识别模式
# true  = 使用 AI 识别（qwen-plus，准确但需要 2-3s）
# false = 使用程序化识别（快速稳定，<100ms）
USE_AI_IDENTIFICATION=false

# L4 视觉分析开关
# true  = 启用视觉模型深度分析（检测文字乱码、布局异常等）
# false = 仅使用程序化检测（快速，覆盖大部分场景）
L4_VISION_ANALYSIS=true
```

### 4. 启动服务

```bash
# 启动后端（在 backend 目录）
node server.js

# 启动前端（在 frontend 目录）
npm run dev
```

### 5. 访问工具

打开浏览器访问 http://localhost:3000

---

## 📁 项目结构

```
case-质量检测/
├── .qoder/
│   └── skills/
│       └── case-quality-check.md    # AI 检测规则文档
├── backend/
│   ├── services/
│   │   ├── aiService.js             # AI 模型调用服务
│   │   └── detectorService.js       # 检测执行服务（含程序化判断）
│   ├── server.js                    # Express 服务入口
│   ├── .env.example                 # 环境变量示例
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx                  # 主组件
│   │   └── main.jsx                 # 入口文件
│   ├── index.html
│   └── package.json
└── README.md
```

---

## 🔧 支持的功能类型

| 功能类型 | 程序化检测方式 | 通过条件 |
|---------|---------------|----------|
| **分享** | 监听弹窗/剪贴板 API | 任一触发即通过 |
| **下载** | 监听 download 事件/blob URL | 产生下载请求即通过 |
| **跳转** | 监听 URL 变化 | URL 变化即通过 |
| **视频播放** | 检测 video.paused | paused=false 即通过 |
| **重置** | 对比表单字段值 | 字段恢复即通过 |
| **表单提交** | 监听 POST/PUT 请求 | 2xx 响应即通过 |

---

## 🔌 API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/detect/url` | POST | URL 方式检测 |
| `/api/detect/html` | POST | HTML 代码检测 |
| `/api/detect/file` | POST | 文件上传检测 |
| `/api/detect/batch` | POST | 批量检测（最多 20 个） |
| `/api/queue/status` | GET | 查看任务队列状态 |
| `/api/health` | GET | 健康检查

---

## 📖 Skills 文档

项目包含详细的 [Skills 规范文档](.qoder/skills/case-quality-check.md)，定义了：

- 功能点识别规则
- L1/L2/L3 检测标准
- **L3 程序化检测逻辑**（证据收集 + 判断函数）
- **L4 布局质量检测**（遮挡/截断/溢出检测）
- AI 模型调用规范
- 输出报告格式

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📄 License

MIT License
