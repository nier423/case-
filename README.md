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
| 🎯 **L3 级检测** | 不仅验证元素存在，还执行真实点击验证功能是否正常 |
| 📊 **程序化检测** | L3 采用程序化为主 + AI 辅助，监听网络请求、URL 变化等 |
| 🖼️ **L4 布局检测** | 检测文字遮挡、截断、溢出等 UI 布局质量问题 |
| 📝 **详细报告** | 生成结构化检测报告，包含通过率、失败原因、修复建议 |
| 🌐 **多种输入** | 支持 URL 链接、HTML 代码粘贴、文件上传三种方式 |

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
程序化布局检测
├─ checkTextTruncation()   → 检测文字截断
├─ checkElementOverlap()   → 检测元素遮挡
└─ checkOverflow()          → 检测内容溢出
    │
    ▼
问题分类
├─ 文字遮挡（z-index问题）  → severity: high
├─ 文字截断（overflow问题）→ severity: medium
├─ 元素溢出（超出视口）    → severity: low
└─ 层叠错乱               → AI 视觉补充分析
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
DASHSCOPE_API_KEY=your_api_key_here
QWEN_CODER_MODEL=qwen-plus
QWEN_VL_MODEL=qwen-vl-plus
PORT=3001
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
