/**
 * AI 服务 - 调用阿里云百炼 API
 * 基于 Skills 文档规则进行功能识别和结果判断
 * 
 * Skills 文档路径: .qoder/skills/case-quality-check.md
 * 
 * ========== 模型调用规范（来自 Skills 文档 5.2）==========
 * 
 * | 阶段 | 任务 | 模型 | 说明 |
 * |------|------|------|------|
 * | 功能点识别 | 分析 HTML 代码 | qwen-plus | 纯代码分析，不需要视觉 |
 * | L1/L2 检测 | 元素存在性检测 | 无需 AI | Playwright 直接执行 |
 * | L3 功能判断 | 看截图判断结果 | qwen-vl-plus | 必须用视觉模型 |
 * | 修复建议 | 生成修复建议 | qwen-plus | 文本分析即可 |
 * 
 * 优化策略：
 * - temperature=0：确保结果稳定可复现
 * - seed=42：相同输入得到相同输出
 * - 按需调用视觉模型：只在 L3 阶段需要看截图时才调用
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

// ========== 从 Skills 文档提取的标准化规则 ==========

const FEATURE_IDENTIFICATION_RULES = `
## 功能点识别规则（来自 Skills 文档第三节）

### 3.1 按钮类功能
| 功能类型 | DOM 识别特征 | 文案关键词 |
|---------|-------------|-----------|
| 分享 | <button>、onclick、navigator.share | 分享、Share、转发、复制链接 |
| 下载 | <a download>、blob:、createObjectURL | 下载、Download、导出、Export |
| 重置 | type="reset"、form.reset() | 重置、Reset、清空、Clear、重新开始 |
| 提交 | type="submit"、form.submit() | 提交、Submit、确认、发送 |

### 3.2 链接跳转类
| 功能类型 | DOM 识别特征 |
|---------|-------------|
| 页内跳转 | href="#xxx" |
| 外部跳转 | href="http(s)://..." |
| 路由跳转 | router.push、history.pushState、@click包含跳转逻辑 |
| 查看详情 | 包含"查看"、"详情"、"更多"文案的可点击元素 |

### 3.3 媒体播放类
| 功能类型 | DOM 识别特征 |
|---------|-------------|
| 视频播放 | <video>、video.play()、播放按钮 |
| 音频播放 | <audio>、audio.play() |

### 3.4 表单交互类
| 功能类型 | DOM 识别特征 |
|---------|-------------|
| 输入框 | <input>、<textarea> |
| 选择器 | <select>、自定义 dropdown |
| 开关/复选 | <input type="checkbox">、toggle、switch |
| Tab切换 | 带有 tab/选项卡样式的元素，点击可切换内容 |
| 图表交互 | 可点击的图表元素、切换视图按钮 |

### 必须跳过的元素
- 纯文本元素（无交互）
- 装饰性图片、图标
- 布局容器（div、section 等无交互的）
- 导航菜单的静态文本
- 已禁用的元素
`;

const L3_DETECTION_STANDARDS = `
## L3 功能性检测标准（来自 Skills 文档第四节 4.2）

| 功能类型 | 触发动作 | 预期结果 | AI 判定依据 |
|---------|---------|---------|------------|
| 分享 | click | 弹出分享面板/复制链接成功/调用系统分享 | 出现分享UI、toast提示、或剪贴板内容变化 |
| 下载 | click | 触发文件下载 | 产生 download 请求或 blob URL |
| 跳转/链接 | click | 页面URL变化或新标签打开或内容区域变化 | location.href变化或window.open调用或显示新内容 |
| 视频播放 | click播放按钮 | 视频开始播放 | video.paused=false && currentTime递增 |
| 重置 | click | 表单/视图恢复初始状态 | 所有表单字段值=初始值，或视图重置 |
| 表单提交 | click提交按钮 | 发送请求且收到响应 | 产生POST/PUT请求且状态码2xx |
| Tab切换 | click | 切换到对应内容 | 点击后显示不同的内容区域 |
| 图表交互 | click | 图表视图变化 | 图表显示内容发生变化 |

## 失败原因分类
- 元素缺失：找不到目标元素
- 事件未绑定：点击后无任何反应
- 请求失败：API调用失败或返回错误
- 逻辑错误：有反应但不是预期结果
`;

/**
 * 调用文本模型进行代码分析
 * 模型：qwen-plus（按 Skills 文档 5.2 规范）
 * 用途：功能点识别、修复建议生成
 */
export async function analyzeWithCoder(prompt, code) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  const model = process.env.QWEN_CODER_MODEL || 'qwen-plus';
  
  const systemPrompt = `你是一个专业的网页功能分析专家。你必须严格按照提供的 Skills 规则来识别功能点，不能随意发挥。
输出必须是纯 JSON 格式，不要包含任何其他内容、解释或 markdown 代码块。`;
  
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${prompt}\n\n代码内容：\n${code}` }
      ],
      temperature: 0,
      seed: 42
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI API 调用失败: ${error}`);
  }
  
  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * 调用视觉模型进行截图分析
 * 模型：qwen-vl-plus（按 Skills 文档 5.2 规范）
 * 用途：L3 功能性判断（需要看截图）
 */
export async function analyzeWithVision(prompt, imageBase64) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  const model = process.env.QWEN_VL_MODEL || 'qwen-vl-plus';
  
  const systemPrompt = `你是一个专业的UI测试专家。你必须严格按照提供的 L3 检测标准来判断功能是否正常工作。
判断要基于截图中可见的变化，输出必须是纯 JSON 格式。`;
  
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } }
          ]
        }
      ],
      temperature: 0,
      seed: 42
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Vision API 调用失败: ${error}`);
  }
  
  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * 识别页面中的功能点（基于 Skills 文档规则）
 * 调用：qwen-plus（文本模型）
 * 依据：Skills 文档第三节 功能点识别规则
 */
export async function identifyFeatures(html) {
  // 使用 Skills 文档中的规则构建 Prompt
  const prompt = `请分析以下网页代码，识别出所有可交互的功能点。

${FEATURE_IDENTIFICATION_RULES}

## 输出要求（必须严格遵守）

1. 输出格式为 JSON 数组，每个功能点包含：
   - id: 唯一标识（格式: feat_1, feat_2, feat_3...）
   - name: 功能名称（简洁中文描述，如"一键分享"、"下载报告"）
   - type: 功能类型（share/download/link/video/audio/reset/submit/button/tab/chart）
   - selector: CSS选择器（必须能唯一定位该元素，优先用 id > class > 属性选择器）
   - expectedBehavior: 预期行为（根据功能类型描述点击后应该发生什么）

2. 选择器要求：
   - 必须精确唯一，能够准确定位到目标元素
   - 如果有 id，使用 #id
   - 如果有特征 class，使用 .class
   - 可以组合使用，如 button.share-btn 或 [data-action="share"]

3. 只识别真正可交互的功能元素，跳过装饰性元素

直接输出 JSON 数组，不要任何其他内容：`;

  const response = await analyzeWithCoder(prompt, html);
  
  console.log('[AI响应] 功能点识别:');
  console.log(response.substring(0, 800) + (response.length > 800 ? '...' : ''));
  
  // 解析 JSON
  try {
    let jsonStr = response.trim();
    
    // 移除可能的 markdown 代码块
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }
    
    // 提取 JSON 数组
    const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const features = JSON.parse(jsonMatch[0]);
      console.log(`[AI解析] 识别到 ${features.length} 个功能点:`);
      features.forEach((f, i) => console.log(`  ${i + 1}. ${f.name} (${f.type}) - ${f.selector}`));
      return features;
    }
    
    console.log('[AI解析] 未找到有效的JSON数组');
    return [];
  } catch (e) {
    console.error('[AI解析] 解析失败:', e.message);
    console.error('原始响应前200字符:', response.substring(0, 200));
    return [];
  }
}

/**
 * 使用视觉模型判断功能是否正常工作（基于 Skills 文档 L3 标准）
 * 调用：qwen-vl-plus（视觉模型）
 * 依据：Skills 文档第四节 4.2 L3 检测标准
 */
export async function judgeFeatureWithVision(featureName, featureType, expectedBehavior, beforeScreenshot, afterScreenshot) {
  // 使用 Skills 文档中的 L3 检测标准
  const prompt = `请根据以下检测标准，判断功能是否正常工作。

${L3_DETECTION_STANDARDS}

## 当前检测任务

【功能信息】
- 功能名称：${featureName}
- 功能类型：${featureType}
- 预期行为：${expectedBehavior}

【检测证据】
这张截图是点击该功能后的页面状态。

【判断要求】
根据上述 L3 检测标准，对比功能类型对应的"预期结果"和"AI判定依据"，判断该功能是否正常工作。

请以 JSON 格式返回判断结果：
{
  "pass": true或false,
  "reason": "具体说明为什么通过或失败，要基于截图中可见的证据",
  "failureType": "如果失败，分类为：元素缺失/事件未绑定/请求失败/逻辑错误，通过则为null",
  "suggestion": "如果失败，给出具体的修复建议，通过则为null"
}

只返回 JSON，不要其他内容：`;

  console.log(`[L3检测] 判断功能: ${featureName} (${featureType})`);
  
  const response = await analyzeWithVision(prompt, afterScreenshot);
  
  console.log('[AI响应] L3判断结果:');
  console.log(response.substring(0, 300));
  
  try {
    let jsonStr = response.trim();
    
    // 移除可能的 markdown 代码块
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }
    
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      console.log(`[L3结果] ${result.pass ? '✅ 通过' : '❌ 失败'} - ${result.reason}`);
      return result;
    }
    return { pass: false, reason: '无法解析AI响应', suggestion: null };
  } catch (e) {
    console.error('[L3解析] 失败:', e.message);
    return { pass: false, reason: '解析失败: ' + e.message, suggestion: null };
  }
}
