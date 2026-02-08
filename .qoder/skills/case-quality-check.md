# Case 质量检测 Skill

## 一、概述

本 Skill 用于检测千问生成的 Case（网页应用）的功能完整性与可用性。检测工具以网页形式运行，集成 AI API 全程参与功能识别与结果判断。

---

## 二、Case 输入规范

### 2.1 支持的输入方式

| 方式 | 格式 | 示例 |
|------|------|------|
| URL | 千问分享链接 | `https://task.qianwen.com/agent/share?task_ids=xxx` |
| 代码上传 | HTML / ZIP 压缩包 | 包含 index.html 的完整前端项目 |
| 代码粘贴 | 纯 HTML 代码 | 单文件网页代码 |

### 2.2 Case 类型标识

| 类型 | 识别特征 | 典型功能 |
|------|---------|---------|
| **Office 办公项目** | 文档编辑、表格计算、演示相关 UI | 导出、打印、重置、保存 |
| **应用项目** | 业务功能型网页 | 分享、下载、跳转、播放视频、提交表单 |

---

## 三、功能点识别规则

AI 需根据以下规则自动识别 Case 中的所有可检测功能点。

### 3.1 按钮类功能

| 功能类型 | DOM 识别特征 | 文案关键词 |
|---------|-------------|-----------|
| **分享** | `<button>`、`onclick`、`navigator.share` | 分享、Share、转发 |
| **下载** | `<a download>`、`blob:`、`createObjectURL` | 下载、Download、导出、Export |
| **重置** | `type="reset"`、`form.reset()` | 重置、Reset、清空、Clear |
| **提交** | `type="submit"`、`form.submit()` | 提交、Submit、确认、发送 |

### 3.2 链接跳转类

| 功能类型 | DOM 识别特征 | 检测要点 |
|---------|-------------|---------|
| **页内跳转** | `href="#xxx"` | 锚点元素存在且可滚动到达 |
| **外部跳转** | `href="http(s)://..."` | 目标 URL 可访问（HTTP 200） |
| **路由跳转** | `router.push`、`history.pushState` | 跳转后页面正常渲染 |

### 3.3 媒体播放类

| 功能类型 | DOM 识别特征 | 检测要点 |
|---------|-------------|---------|
| **视频播放** | `<video>`、`video.play()` | 点击播放后 `currentTime` 变化 |
| **音频播放** | `<audio>`、`audio.play()` | 点击播放后 `currentTime` 变化 |

### 3.4 表单交互类

| 功能类型 | DOM 识别特征 | 检测要点 |
|---------|-------------|---------|
| **输入框** | `<input>`、`<textarea>` | 可聚焦、可输入、值可变更 |
| **选择器** | `<select>`、自定义 dropdown | 可展开、可选中、值可变更 |
| **开关/复选** | `<input type="checkbox">`、toggle | 可点击切换状态 |

---

## 四、检测标准（L1 → L3）

每个功能点需通过三级检测，全部通过才算合格。

### 4.1 通用检测层级

```
┌─────────────────────────────────────────────────────────────┐
│  L1 存在性检测                                               │
│  ────────────────                                           │
│  • 目标元素在 DOM 中存在                                      │
│  • 元素可见（非 display:none / visibility:hidden）           │
│  • 判定：querySelector 能找到 && isVisible = true            │
└─────────────────────────────────────────────────────────────┘
                            ↓ 通过
┌─────────────────────────────────────────────────────────────┐
│  L2 可交互性检测                                             │
│  ────────────────                                           │
│  • 元素未被禁用（非 disabled）                                │
│  • 元素未被遮挡（z-index 正常、无 overlay 覆盖）              │
│  • 元素在视口内或可滚动到达                                   │
│  • 判定：isEnabled && isClickable && isInViewport           │
└─────────────────────────────────────────────────────────────┘
                            ↓ 通过
┌─────────────────────────────────────────────────────────────┐
│  L3 功能性检测                                               │
│  ────────────────                                           │
│  • 执行交互动作（点击/输入/选择）                             │
│  • 捕获交互结果（网络请求/DOM变化/状态变更）                  │
│  • AI 判断结果是否符合预期                                    │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 L3 检测核心原则：程序化检测为主 + AI 辅助判断

```
┌─────────────────────────────────────────────────────────────┐
│  L3 检测改进原则（重要！）                                     │
│  ────────────────                                           │
│                                                             │
│  ❌ 错误做法：仅靠 AI 看截图判断                              │
│     → 视觉模型看不到网络请求、剪贴板变化、URL跳转等           │
│                                                             │
│  ✅ 正确做法：程序化收集证据 + AI 辅助判断                    │
│     1. Playwright 收集多维度证据（网络请求、DOM变化等）       │
│     2. 程序化规则先做初步判断                                 │
│     3. AI 仅在程序化无法确定时辅助判断                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 各功能类型的 L3 程序化检测标准

| 功能类型 | 触发动作 | 程序化检测方式 | 通过条件 | AI 辅助场景 |
|---------|---------|---------------|---------|------------|
| **分享** | click | 监听弹窗/剪贴板API/toast | 任一触发即通过 | 检测到变化但无法确认 |
| **下载** | click | 监听 download 事件/blob URL | 产生下载请求即通过 | 无（纯程序化） |
| **跳转** | click | 监听 URL 变化/window.open | URL 变化即通过 | 无（纯程序化） |
| **视频播放** | click | 检测 video.paused + currentTime | paused=false 即通过 | 无（纯程序化） |
| **重置** | click | 对比点击前后表单字段值 | 字段值恢复即通过 | 无（纯程序化） |
| **表单提交** | click | 监听 POST/PUT 请求 + 状态码 | 2xx 响应即通过 | 确认 UI 反馈 |

### 4.4 L3 证据收集（Playwright 实现）

```javascript
// L3 检测前启动的监听器
const evidence = {
  networkRequests: [],      // 网络请求列表
  consoleMessages: [],      // console 日志
  dialogAppeared: false,    // 是否弹出对话框
  dialogMessage: '',        // 对话框内容
  urlBefore: '',            // 点击前 URL
  urlAfter: '',             // 点击后 URL
  downloadTriggered: false, // 是否触发下载
  videoStateChange: null,   // 视频状态变化
};

// 启动监听（在点击前）
page.on('request', req => evidence.networkRequests.push({
  url: req.url(),
  method: req.method()
}));
page.on('console', msg => evidence.consoleMessages.push(msg.text()));
page.on('dialog', async dialog => {
  evidence.dialogAppeared = true;
  evidence.dialogMessage = dialog.message();
  await dialog.accept();
});
page.on('download', () => evidence.downloadTriggered = true);

// 记录点击前状态
evidence.urlBefore = page.url();

// 执行点击
await element.click();
await page.waitForTimeout(1500);

// 记录点击后状态
evidence.urlAfter = page.url();
```

### 4.5 各功能类型的程序化判断逻辑

```javascript
// 分享功能 - 程序化判断
function judgeShare(evidence) {
  if (evidence.dialogAppeared && /分享|share|复制|成功/i.test(evidence.dialogMessage))
    return { pass: true, reason: '弹出分享/复制确认弹窗' };
  if (evidence.consoleMessages.some(m => /share|clipboard/i.test(m)))
    return { pass: true, reason: '检测到分享/剪贴板 API 调用' };
  return { pass: false, reason: '点击后无任何分享响应' };
}

// 下载功能 - 程序化判断
function judgeDownload(evidence) {
  if (evidence.downloadTriggered)
    return { pass: true, reason: '成功触发文件下载' };
  if (evidence.networkRequests.some(r => /download|blob:|.pdf|.xlsx/i.test(r.url)))
    return { pass: true, reason: '检测到下载请求' };
  return { pass: false, reason: '点击后未触发下载' };
}

// 跳转功能 - 程序化判断
function judgeLink(evidence) {
  if (evidence.urlBefore !== evidence.urlAfter)
    return { pass: true, reason: `URL 已跳转至: ${evidence.urlAfter}` };
  return { pass: false, reason: 'URL 未变化，跳转未生效' };
}

// 视频播放 - 程序化判断
async function judgeVideo(page, selector) {
  const videoState = await page.evaluate((sel) => {
    const video = document.querySelector(sel) || document.querySelector('video');
    return video ? { paused: video.paused, currentTime: video.currentTime } : null;
  }, selector);
  
  if (videoState && !videoState.paused && videoState.currentTime > 0)
    return { pass: true, reason: '视频已开始播放' };
  return { pass: false, reason: '视频未播放或不存在' };
}

// 重置功能 - 程序化判断
function judgeReset(formValuesBefore, formValuesAfter, initialValues) {
  const allReset = Object.keys(initialValues).every(
    key => formValuesAfter[key] === initialValues[key]
  );
  if (allReset)
    return { pass: true, reason: '表单已重置为初始值' };
  return { pass: false, reason: '表单未完全重置' };
}

// 表单提交 - 程序化判断
function judgeSubmit(evidence) {
  const submitReq = evidence.networkRequests.find(
    r => r.method === 'POST' || r.method === 'PUT'
  );
  if (submitReq)
    return { pass: true, reason: `检测到 ${submitReq.method} 请求` };
  return { pass: false, reason: '未检测到表单提交请求' };
}
```

### 4.6 AI 辅助判断（仅在程序化无法确定时使用）

| 场景 | 何时使用 AI | AI 判断内容 |
|------|-----------|------------|
| 分享 Toast | 检测到 DOM 变化但无法确认是否为成功提示 | 分析截图中 Toast 文案 |
| 表单提交反馈 | 请求成功但需确认页面是否显示成功状态 | 分析截图中 UI 反馈 |
| 复杂交互 | 程序化无法覆盖的特殊交互 | 对比前后截图差异 |

### 4.7 L4 布局质量检测（新增）

```
┌─────────────────────────────────────────────────────────────┐
│  L4 布局质量检测                                           │
│  ────────────────                                           │
│  目的：检测 UI 元素是否完整显示、无遮挡、无截断               │
│                                                             │
│  常见问题：                                                    │
│  • 文字被图片/其他元素遮挡（z-index 层级问题）              │
│  • 文字被截断显示不全（overflow: hidden 问题）              │
│  • 元素超出容器/视口范围                                    │
│  • 文字重叠、布局错乱                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 4.7.1 布局问题分类

| 问题类型 | 表现 | 检测方式 | 判定标准 |
|---------|------|---------|----------|
| **文字遮挡** | 文字被图片/元素覆盖 | 程序化 + AI | z-index 对比 + 视觉确认 |
| **文字截断** | 文字末尾显示 "..." 或被切断 | 程序化 + AI | 检测 overflow/text-overflow |
| **元素溢出** | 内容超出容器边界 | 程序化 | boundingBox 对比 |
| **层叠错乱** | 多个元素重叠在一起 | AI 视觉 | 截图分析 |

#### 4.7.2 程序化检测方法

```javascript
// 检测文字是否被截断
async function checkTextTruncation(page) {
  return await page.evaluate(() => {
    const issues = [];
    const textElements = document.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6, div');
    
    textElements.forEach(el => {
      const style = getComputedStyle(el);
      const isOverflowHidden = style.overflow === 'hidden' || 
                                style.textOverflow === 'ellipsis';
      
      // 检测内容是否被截断（垂直方向）
      if (isOverflowHidden && el.scrollHeight > el.clientHeight) {
        issues.push({
          type: 'text_truncated',
          element: el.tagName + (el.className ? '.' + el.className.split(' ')[0] : ''),
          text: el.textContent.substring(0, 50) + '...',
          reason: '文字超出容器高度被截断'
        });
      }
      
      // 检测横向截断
      if (isOverflowHidden && el.scrollWidth > el.clientWidth) {
        issues.push({
          type: 'text_truncated',
          element: el.tagName,
          text: el.textContent.substring(0, 50) + '...',
          reason: '文字超出容器宽度被截断'
        });
      }
    });
    
    return issues;
  });
}

// 检测元素是否被遮挡
async function checkElementOverlap(page) {
  return await page.evaluate(() => {
    const issues = [];
    const textElements = document.querySelectorAll('h1, h2, h3, p, span');
    
    textElements.forEach(el => {
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      // 获取该位置最上层的元素
      const topElement = document.elementFromPoint(centerX, centerY);
      
      // 如果最上层元素不是自己或自己的子元素，说明被遮挡
      if (topElement && !el.contains(topElement) && !topElement.contains(el)) {
        issues.push({
          type: 'element_covered',
          element: el.tagName,
          text: el.textContent.substring(0, 30),
          coveredBy: topElement.tagName,
          reason: `被 ${topElement.tagName} 元素遮挡`
        });
      }
    });
    
    return issues;
  });
}
```

#### 4.7.3 AI 视觉检测（补充）

**Prompt 模板：**
```
你是一个 UI 质量检测专家。请分析这张网页截图，检测以下布局问题：

1. 是否有文字被图片或其他元素遮挡？
2. 是否有文字显示不完整（被截断、以"..."结尾）？
3. 是否有元素超出屏幕边界？
4. 布局是否整齐、无重叠错乱？

请以 JSON 格式返回：
{
  "hasLayoutIssues": true/false,
  "issues": [
    {
      "type": "text_covered" | "text_truncated" | "overflow" | "overlap",
      "description": "具体描述问题",
      "location": "问题位置（顶部/底部/左侧...）",
      "severity": "high" | "medium" | "low"
    }
  ],
  "suggestion": "修复建议"
}
```

#### 4.7.4 检测流程

```
L4 布局质量检测流程：

① 页面加载完成后截图
       │
       ▼
② 程序化检测
   ├─ checkTextTruncation()  → 检测文字截断
   ├─ checkElementOverlap()  → 检测元素遮挡
   └─ checkOverflow()         → 检测内容溢出
       │
       ▼
③ AI 视觉补充检测
   └─ 发送截图给 qwen-vl-plus 分析布局问题
       │
       ▼
④ 汇总问题并生成报告
   ├─ 无问题 → L4 通过
   └─ 有问题 → L4 失败，列出具体问题和修复建议
```

---

## 五、AI 介入流程

### 5.1 AI 职责分工

```
┌─────────────────────────────────────────────────────────────┐
│                      AI 全流程参与                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  阶段1: 功能点识别                                           │
│  ───────────────                                            │
│  输入：Case 的 HTML/JS 代码 或 页面截图                       │
│  输出：功能点清单 + 每个功能点的预期行为描述                   │
│                                                             │
│  阶段2: 检测方案生成                                         │
│  ───────────────                                            │
│  输入：功能点清单                                            │
│  输出：每个功能点的具体检测步骤（Playwright 脚本逻辑）        │
│                                                             │
│  阶段3: 结果智能判断                                         │
│  ───────────────                                            │
│  输入：检测执行后的截图、日志、网络请求记录                   │
│  输出：每个功能点是否正常工作的判定 + 理由                    │
│                                                             │
│  阶段4: 修复建议生成                                         │
│  ───────────────                                            │
│  输入：失败的功能点 + 错误信息                               │
│  输出：具体的代码修复建议                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 AI 模型调用规范

#### 模型选择原则

| 任务类型 | 推荐模型 | 原因 |
|---------|---------|------|
| **代码分析/逻辑推理** | `qwen-plus` | 纯文本分析，速度快，成本低 |
| **截图分析/视觉判断** | `qwen-vl-plus` | 需要理解图像内容 |

#### 各阶段模型调用

| 阶段 | 任务 | 模型 | 说明 |
|------|------|------|------|
| **功能点识别** | 分析 HTML 代码识别功能点 | `qwen-plus` | 纯代码分析，不需要视觉能力 |
| **L1/L2 检测** | 元素存在性、可交互性 | 无需 AI | Playwright 直接执行 |
| **L3 功能判断** | 程序化检测 + AI 辅助 | 程序化为主，`qwen-vl-plus` 辅助 | 仅在程序化无法确定时才用 AI |
| **修复建议** | 生成代码修复建议 | `qwen-plus` | 文本分析即可 |

#### 模型调用优化策略

| 策略 | 说明 | 效果 |
|------|------|------|
| **按需调用视觉模型** | 只在 L3 阶段需要看截图时才调用 qwen-vl-plus | 减少 API 成本和时间 |
| **文本任务用文本模型** | 代码分析、修复建议等用 qwen-plus | 速度快 2-3 倍 |
| **temperature=0** | 所有调用都设置 temperature=0 | 确保结果稳定可复现 |
| **seed 固定** | 设置固定的 seed=42 | 相同输入得到相同输出 |

#### API 调用参数模板

**文本模型调用（功能点识别/修复建议）**
```json
{
  "model": "qwen-plus",
  "temperature": 0,
  "seed": 42,
  "messages": [...]
}
```

**视觉模型调用（L3 判断）**
```json
{
  "model": "qwen-vl-plus",
  "temperature": 0,
  "seed": 42,
  "messages": [
    {
      "role": "user",
      "content": [
        {"type": "text", "text": "..."},
        {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}
      ]
    }
  ]
}
```

### 5.3 AI Prompt 模板

#### 功能点识别 Prompt

```
你是一个网页功能分析专家。请分析以下网页代码/截图，识别出所有可交互的功能点。

【输入】
{Case 代码或截图}

【输出格式】
| 序号 | 功能名称 | 功能类型 | 元素定位 | 预期行为 |
|------|---------|---------|---------|---------|
| 1    | xxx     | 分享/下载/跳转/播放/重置/提交 | CSS选择器或XPath | 点击后应该发生什么 |

请确保：
1. 不遗漏任何可交互元素
2. 准确判断功能类型
3. 预期行为描述具体、可验证
```

#### 结果判断 Prompt

```
你是一个网页功能测试专家。请根据以下检测证据，判断该功能是否正常工作。

【功能信息】
- 功能名称：{功能名称}
- 功能类型：{功能类型}
- 预期行为：{预期行为}

【检测证据】
- 点击前截图：{截图1}
- 点击后截图：{截图2}
- 网络请求日志：{请求记录}
- 控制台日志：{console.log}
- DOM 变化：{DOM diff}

【输出格式】
{
  "功能名称": "xxx",
  "检测结果": "通过" | "失败",
  "判定理由": "具体说明为什么通过或失败",
  "失败原因分类": "元素缺失" | "事件未绑定" | "请求失败" | "逻辑错误" | null,
  "修复建议": "如果失败，给出具体修复方向"
}
```

---

## 六、检测执行流程

```
┌─────────────────────────────────────────────────────────────┐
│                      完整检测流程                            │
└─────────────────────────────────────────────────────────────┘

Step 1: 加载 Case
────────────────
├─ URL 方式 → Playwright 打开页面，等待加载完成
├─ 代码方式 → 本地启动临时服务器，Playwright 访问
└─ 截图记录初始状态

Step 2: AI 识别功能点
────────────────
├─ 提取页面 HTML + 截图
├─ 调用 AI API（功能点识别 Prompt）
└─ 获得功能点清单

Step 3: 逐一执行检测
────────────────
FOR EACH 功能点:
  ├─ L1 检测：querySelector + isVisible
  ├─ L2 检测：isEnabled + isClickable
  ├─ L3 检测：
  │   ├─ 执行交互动作
  │   ├─ 等待响应（网络请求/DOM变化）
  │   ├─ 截图记录交互后状态
  │   └─ 收集所有检测证据
  └─ AI 判断：调用 AI API（结果判断 Prompt）

Step 4: 生成检测报告
────────────────
├─ 汇总所有功能点检测结果
├─ 统计通过率
├─ 对失败项生成修复建议
└─ 输出结构化报告
```

---

## 七、输出报告格式

### 7.1 报告头部

```
═══════════════════════════════════════════════════════════════
                    Case 质量检测报告
═══════════════════════════════════════════════════════════════
检测时间：2026-02-06 14:30:00
Case 来源：https://task.qianwen.com/agent/share?task_ids=xxx
Case 类型：应用项目
检测耗时：12.5 秒
───────────────────────────────────────────────────────────────
总功能点：5 个
通过：4 个 ✅
失败：1 个 ❌
通过率：80%
═══════════════════════════════════════════════════════════════
```

### 7.2 详细检测结果

```
┌─────────────────────────────────────────────────────────────┐
│ 功能点 #1: 一键分享球探报告                                   │
├─────────────────────────────────────────────────────────────┤
│ 类型：分享                                                   │
│ 定位：button.share-btn                                       │
│ ─────────────────────────────────────────────────────────── │
│ L1 存在性   ✅ 元素存在且可见                                 │
│ L2 可交互性 ✅ 元素可点击，未被遮挡                           │
│ L3 功能性   ✅ 点击后成功调用系统分享                         │
│ ─────────────────────────────────────────────────────────── │
│ 最终结果：✅ 通过                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 功能点 #2: 下载报告PDF                                       │
├─────────────────────────────────────────────────────────────┤
│ 类型：下载                                                   │
│ 定位：a.download-link                                        │
│ ─────────────────────────────────────────────────────────── │
│ L1 存在性   ✅ 元素存在且可见                                 │
│ L2 可交互性 ✅ 元素可点击                                     │
│ L3 功能性   ❌ 点击后未触发下载                               │
│ ─────────────────────────────────────────────────────────── │
│ 失败原因：href 属性为空，未绑定 download 属性                 │
│ 修复建议：为 <a> 标签添加有效的 href 和 download 属性         │
│ ─────────────────────────────────────────────────────────── │
│ 最终结果：❌ 失败                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.3 报告尾部汇总

```
═══════════════════════════════════════════════════════════════
                        修复建议汇总
═══════════════════════════════════════════════════════════════
1. [下载报告PDF] 为 <a> 标签添加有效的 href 和 download 属性

   修复代码示例：
   <a href="/api/report.pdf" download="球探报告.pdf">下载报告PDF</a>

═══════════════════════════════════════════════════════════════
                        检测结论
═══════════════════════════════════════════════════════════════
本 Case 存在 1 个功能缺陷，建议修复后重新检测。
通过率达到 100% 即为合格。
═══════════════════════════════════════════════════════════════
```

---

## 八、技术实现要点

### 8.1 核心技术栈

| 模块 | 技术选型 | 说明 |
|------|---------|------|
| 前端界面 | Vue 3 / React | 检测工具的网页 UI |
| 浏览器自动化 | Playwright | 执行 L3 功能检测 |
| 后端服务 | Node.js / Python | 调度检测任务、调用 AI API |
| AI API | 千问 API / 通用 LLM API | 功能识别 + 结果判断 |

### 8.2 关键检测代码逻辑（伪代码）

```javascript
async function detectFeature(page, feature) {
  // L1: 存在性检测
  const element = await page.$(feature.selector);
  if (!element) return { level: 'L1', pass: false, reason: '元素不存在' };
  
  const isVisible = await element.isVisible();
  if (!isVisible) return { level: 'L1', pass: false, reason: '元素不可见' };
  
  // L2: 可交互性检测
  const isEnabled = await element.isEnabled();
  if (!isEnabled) return { level: 'L2', pass: false, reason: '元素被禁用' };
  
  // L3: 功能性检测
  const beforeScreenshot = await page.screenshot();
  const requestLogs = [];
  page.on('request', req => requestLogs.push(req));
  
  await element.click();
  await page.waitForTimeout(1000);
  
  const afterScreenshot = await page.screenshot();
  
  // 调用 AI 判断结果
  const aiResult = await callAI({
    feature,
    beforeScreenshot,
    afterScreenshot,
    requestLogs
  });
  
  return aiResult;
}
```

---

## 九、边界情况处理

| 场景 | 处理策略 |
|------|---------|
| Case URL 需要登录 | 提示用户提供登录态 Cookie 或使用代码上传方式 |
| 功能需要网络请求但接口不通 | 标记为"环境依赖失败"，非 Case 本身问题 |
| 页面加载超时 | 重试 2 次，仍失败则标记为"加载失败" |
| AI 识别遗漏功能点 | 支持用户手动添加功能点到检测清单 |
| 动态渲染内容 | 等待页面稳定（networkidle）后再开始检测 |

---

## 十、扩展能力

### 10.1 批量检测
支持一次性输入多个 Case URL，并行检测，最终生成汇总报告。

### 10.2 检测历史
保存每次检测的报告，支持查看历史记录、对比不同版本的 Case。

### 10.3 自定义检测规则
用户可针对特定项目添加自定义功能类型和检测标准。
