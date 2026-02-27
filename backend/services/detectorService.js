/**
 * 检测服务 - 使用 Playwright 执行功能检测
 * 
 * 增强版功能：
 * - 程序化功能点识别（可选替代 AI 识别）
 * - L4 布局质量检测增强（遮挡、图表完整性、边界溢出）
 * - 视觉模型深度分析
 * - 任务ID唯一化（支持并发）
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, readFileSync } from 'fs';
import { identifyFeatures, identifyFeaturesFallback, judgeFeatureWithVision, analyzeLayoutWithVision } from './aiService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const screenshotsDir = join(__dirname, '..', 'screenshots');

// 生成唯一任务ID
let taskCounter = 0;
function generateTaskId() {
  return `${Date.now()}_${++taskCounter}`;
}

/**
 * 程序化功能点识别（完整版）
 * 基于 Skills 文档第三节的规则，100% 程序化实现
 * @param {Page} page - Playwright 页面对象
 * @returns {Promise<Array>} 功能点列表
 */
async function identifyFeaturesFromDOM(page) {
  console.log('[功能识别] 使用程序化 DOM 分析...');
  
  const features = await page.evaluate(() => {
    const results = [];
    let idCounter = 0;
    
    // 辅助函数：生成选择器
    function generateSelector(el) {
      if (el.id) return `#${el.id}`;
      
      const dataAttrs = ['data-testid', 'data-id', 'data-action', 'data-name'];
      for (const attr of dataAttrs) {
        const value = el.getAttribute(attr);
        if (value) return `[${attr}="${value}"]`;
      }
      
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.split(' ').filter(c => 
          c && !c.startsWith('_') && c.length < 30 &&
          !/^(active|hover|focus|disabled|hidden)$/i.test(c)
        );
        if (classes.length > 0) {
          const selector = `${el.tagName.toLowerCase()}.${classes[0]}`;
          if (document.querySelectorAll(selector).length === 1) return selector;
          if (classes.length > 1) {
            const selector2 = `${el.tagName.toLowerCase()}.${classes[0]}.${classes[1]}`;
            if (document.querySelectorAll(selector2).length === 1) return selector2;
          }
        }
      }
      
      const text = el.textContent?.trim();
      if (text && text.length < 20 && !text.includes('\n')) {
        return `${el.tagName.toLowerCase()}:has-text("${text}")`;
      }
      
      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children);
        const index = siblings.indexOf(el) + 1;
        const parentSelector = parent.id ? `#${parent.id}` : 
                              parent.className ? `.${parent.className.split(' ')[0]}` : 
                              parent.tagName.toLowerCase();
        return `${parentSelector} > ${el.tagName.toLowerCase()}:nth-child(${index})`;
      }
      
      return el.tagName.toLowerCase();
    }
    
    // 辅助函数：检查是否已识别
    function isAlreadyAdded(el) {
      return results.some(r => r.selector === generateSelector(el));
    }
    
    // ===== 3.1 按钮类功能识别 =====
    
    // 分享按钮
    document.querySelectorAll('button, a, [onclick], [role="button"]').forEach(el => {
      const text = el.textContent?.trim() || '';
      const className = el.className?.toString() || '';
      const onclick = el.getAttribute('onclick') || '';
      
      if (/分享|share|转发|forward/i.test(text + className + onclick)) {
        if (!isAlreadyAdded(el)) {
          results.push({
            id: `feat_${++idCounter}`,
            name: text || '分享按钮',
            type: 'share',
            selector: generateSelector(el),
            expectedBehavior: '点击后应弹出分享面板或复制链接成功'
          });
        }
      }
    });
    
    // 下载按钮
    document.querySelectorAll('a[download], button, [onclick]').forEach(el => {
      const text = el.textContent?.trim() || '';
      const className = el.className?.toString() || '';
      const hasDownload = el.hasAttribute('download');
      const onclick = el.getAttribute('onclick') || '';
      
      if (hasDownload || /下载|download|导出|export/i.test(text + className + onclick)) {
        if (!isAlreadyAdded(el)) {
          results.push({
            id: `feat_${++idCounter}`,
            name: text || '下载按钮',
            type: 'download',
            selector: generateSelector(el),
            expectedBehavior: '点击后应触发文件下载'
          });
        }
      }
    });
    
    // 重置按钮
    document.querySelectorAll('button[type="reset"], input[type="reset"], button, [onclick]').forEach(el => {
      const text = el.textContent?.trim() || '';
      const type = el.getAttribute('type');
      const onclick = el.getAttribute('onclick') || '';
      
      if (type === 'reset' || /重置|reset|清空|clear|重新开始/i.test(text + onclick)) {
        if (!isAlreadyAdded(el)) {
          results.push({
            id: `feat_${++idCounter}`,
            name: text || '重置按钮',
            type: 'reset',
            selector: generateSelector(el),
            expectedBehavior: '点击后表单/视图应恢复初始状态'
          });
        }
      }
    });
    
    // 提交按钮
    document.querySelectorAll('button[type="submit"], input[type="submit"], button, [onclick]').forEach(el => {
      const text = el.textContent?.trim() || '';
      const type = el.getAttribute('type');
      const onclick = el.getAttribute('onclick') || '';
      
      if (type === 'submit' || /提交|submit|确认|confirm|发送|send/i.test(text + onclick)) {
        if (!isAlreadyAdded(el)) {
          results.push({
            id: `feat_${++idCounter}`,
            name: text || '提交按钮',
            type: 'submit',
            selector: generateSelector(el),
            expectedBehavior: '点击后应发送表单请求'
          });
        }
      }
    });
    
    // ===== 3.2 链接跳转类 =====
    document.querySelectorAll('a[href], [onclick*="location"], [onclick*="href"], [onclick*="navigate"]').forEach(el => {
      const href = el.getAttribute('href') || '';
      const text = el.textContent?.trim() || '';
      
      if (isAlreadyAdded(el)) return;
      if (!href || href === '#' || href === 'javascript:void(0)' || href === 'javascript:;') return;
      
      if (!href.startsWith('javascript:')) {
        const isExternal = /^https?:\/\//.test(href);
        const isAnchor = href.startsWith('#') && href.length > 1;
        
        results.push({
          id: `feat_${++idCounter}`,
          name: text || (isExternal ? '外部链接' : isAnchor ? '页内跳转' : '链接'),
          type: 'link',
          selector: generateSelector(el),
          expectedBehavior: isExternal ? '点击后应跳转到外部页面' : 
                          isAnchor ? '点击后应滚动到对应位置' : 
                          '点击后 URL 应发生变化'
        });
      }
    });
    
    // 查看详情类
    document.querySelectorAll('a, button, [onclick], [role="button"]').forEach(el => {
      const text = el.textContent?.trim() || '';
      if (/查看|详情|更多|view|detail|more/i.test(text) && text.length < 20) {
        if (!isAlreadyAdded(el)) {
          results.push({
            id: `feat_${++idCounter}`,
            name: text,
            type: 'link',
            selector: generateSelector(el),
            expectedBehavior: '点击后应显示详情内容或跳转'
          });
        }
      }
    });
    
    // ===== 3.3 媒体播放类 =====
    document.querySelectorAll('video').forEach(el => {
      results.push({
        id: `feat_${++idCounter}`,
        name: '视频播放',
        type: 'video',
        selector: generateSelector(el),
        expectedBehavior: '点击播放按钮后视频应开始播放'
      });
    });
    
    document.querySelectorAll('audio').forEach(el => {
      results.push({
        id: `feat_${++idCounter}`,
        name: '音频播放',
        type: 'audio',
        selector: generateSelector(el),
        expectedBehavior: '点击播放按钮后音频应开始播放'
      });
    });
    
    // ===== 3.4 Tab 切换 =====
    document.querySelectorAll('[role="tab"], [class*="tab"]:not([class*="table"]), [data-tab]').forEach(el => {
      const text = el.textContent?.trim();
      if (text && text.length < 20 && !isAlreadyAdded(el)) {
        results.push({
          id: `feat_${++idCounter}`,
          name: `Tab: ${text}`,
          type: 'tab',
          selector: generateSelector(el),
          expectedBehavior: '点击后应切换到对应内容区域'
        });
      }
    });
    
    // ===== 3.5 通用按钮 =====
    document.querySelectorAll('button:not([disabled]), [role="button"]:not([disabled])').forEach(el => {
      const text = el.textContent?.trim();
      if (!text || text.length > 30) return;
      if (isAlreadyAdded(el)) return;
      if (/close|关闭|×|取消|cancel/i.test(text)) return;
      
      results.push({
        id: `feat_${++idCounter}`,
        name: text,
        type: 'button',
        selector: generateSelector(el),
        expectedBehavior: `点击"${text}"按钮应有相应响应`
      });
    });
    
    return results;
  });
  
  console.log(`[功能识别] 程序化识别到 ${features.length} 个功能点`);
  features.forEach((f, i) => console.log(`  ${i + 1}. ${f.name} (${f.type}) - ${f.selector}`));
  
  return features;
}

/**
 * 从 URL 检测 Case
 */
export async function detectFromUrl(url) {
  const taskId = generateTaskId();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  
  const startTime = Date.now();
  const report = {
    source: url,
    sourceType: 'url',
    timestamp: new Date().toISOString(),
    features: [],
    layoutQuality: null,
    summary: { total: 0, passed: 0, failed: 0, passRate: 0, layoutIssues: 0 }
  };
  
  try {
    console.log('[Step 1] 加载页面...');
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      await page.goto(url, { waitUntil: 'commit', timeout: 15000 });
    }
    await page.waitForTimeout(3000);
    try {
      await page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch (e) {}
    
    const html = await page.content();
    
    // Step 2: 功能点识别
    console.log('[Step 2] 功能点识别...');
    let features = [];
    const useAI = process.env.USE_AI_IDENTIFICATION !== 'false';
    
    if (useAI) {
      try {
        features = await identifyFeatures(html);
      } catch (e) {
        console.error('[Step 2] AI识别失败，切换程序化:', e.message);
        features = await identifyFeaturesFromDOM(page);
      }
    } else {
      features = await identifyFeaturesFromDOM(page);
    }
    
    if (features.length === 0) {
      features = identifyFeaturesFallback(html);
    }
    
    // Step 3: 逐一检测功能点
    console.log('[Step 3] 开始逐一检测功能点...');
    for (let i = 0; i < features.length; i++) {
      const feature = features[i];
      console.log(`[Step 3.${i + 1}] 检测: ${feature.name}`);
      const result = await detectFeature(page, feature, i, taskId);
      report.features.push(result);
    }
    
    // Step 4: L4 布局质量检测
    console.log('[Step 4] 执行 L4 布局质量检测...');
    report.layoutQuality = await checkLayoutQuality(page);
    
    // 生成统计
    report.summary.total = report.features.length;
    report.summary.passed = report.features.filter(f => f.finalResult === 'pass').length;
    report.summary.failed = report.summary.total - report.summary.passed;
    report.summary.passRate = report.summary.total > 0 
      ? Math.round((report.summary.passed / report.summary.total) * 100) : 0;
    report.summary.layoutIssues = report.layoutQuality?.issues?.length || 0;
    report.duration = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
    
  } catch (error) {
    report.error = error.message;
    console.error('[错误]', error);
  } finally {
    await browser.close();
  }
  
  return report;
}

/**
 * 从 HTML 代码检测 Case
 */
export async function detectFromHtml(html) {
  const taskId = generateTaskId();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  
  const startTime = Date.now();
  const report = {
    source: 'HTML代码',
    sourceType: 'html',
    timestamp: new Date().toISOString(),
    features: [],
    layoutQuality: null,
    summary: { total: 0, passed: 0, failed: 0, passRate: 0, layoutIssues: 0 }
  };
  
  try {
    // Step 1: 加载 HTML
    console.log('[Step 1] 加载 HTML...');
    try {
      await page.setContent(html, { waitUntil: 'networkidle', timeout: 10000 });
      await page.waitForTimeout(1000);
    } catch (e) {
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
    }
    
    // Step 2: 功能点识别
    console.log('[Step 2] 功能点识别...');
    let features = [];
    const useAI = process.env.USE_AI_IDENTIFICATION !== 'false';
    
    if (useAI) {
      try {
        features = await identifyFeatures(html);
        console.log(`[Step 2] ✅ AI 识别到 ${features.length} 个功能点`);
      } catch (e) {
        console.error('[Step 2] AI识别失败，切换程序化:', e.message);
        features = await identifyFeaturesFromDOM(page);
      }
    } else {
      console.log('[Step 2] 使用程序化模式识别功能点...');
      features = await identifyFeaturesFromDOM(page);
    }
    
    if (features.length === 0) {
      console.log('[Step 2] ⚠️ 未识别到功能点，使用备用方案...');
      features = identifyFeaturesFallback(html);
    }
    
    // Step 3: 逐一检测功能点
    if (features.length > 0) {
      console.log('[Step 3] 开始逐一检测功能点...');
      for (let i = 0; i < features.length; i++) {
        const feature = features[i];
        console.log(`[Step 3.${i + 1}] 检测: ${feature.name}`);
        try {
          const result = await detectFeature(page, feature, i, taskId);
          report.features.push(result);
          console.log(`[Step 3.${i + 1}] ✅ 完成: ${result.finalResult}`);
        } catch (e) {
          console.error(`[Step 3.${i + 1}] ❌ 检测失败:`, e.message);
          report.features.push({
            id: feature.id, name: feature.name, type: feature.type,
            selector: feature.selector, expectedBehavior: feature.expectedBehavior,
            l1: { pass: false, message: `检测失败: ${e.message}` },
            l2: { pass: false, message: '' }, l3: { pass: false, message: '' },
            finalResult: 'fail', error: e.message
          });
        }
      }
    }
    
    // Step 4: L4 布局质量检测
    console.log('[Step 4] 执行 L4 布局质量检测...');
    try {
      report.layoutQuality = await checkLayoutQuality(page);
      console.log(`[Step 4] ✅ L4 检测完成: ${report.layoutQuality.pass ? '通过' : '发现问题'}`);
    } catch (e) {
      console.error('[Step 4] ❌ L4 检测失败:', e.message);
      report.layoutQuality = { pass: false, issues: [], error: e.message };
    }
    
    // 生成统计
    report.summary.total = report.features.length;
    report.summary.passed = report.features.filter(f => f.finalResult === 'pass').length;
    report.summary.failed = report.summary.total - report.summary.passed;
    report.summary.passRate = report.summary.total > 0 
      ? Math.round((report.summary.passed / report.summary.total) * 100) : 0;
    report.summary.layoutIssues = report.layoutQuality?.issues?.length || 0;
    report.duration = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
    
    console.log(`[完成] 检测完成: ${report.summary.passed}/${report.summary.total} 通过`);
    
  } catch (error) {
    report.error = error.message;
    console.error('[严重错误]', error);
  } finally {
    try {
      await browser.close();
    } catch (e) {}
  }
  
  return report;
}

/**
 * 检测单个功能点
 */
async function detectFeature(page, feature, index, taskId = '') {
  const result = {
    id: feature.id,
    name: feature.name,
    type: feature.type,
    selector: feature.selector,
    expectedBehavior: feature.expectedBehavior,
    l1: { pass: false, message: '' },
    l2: { pass: false, message: '' },
    l3: { pass: false, message: '' },
    finalResult: 'fail',
    suggestion: null,
    evidence: {}
  };
  
  try {
    // L1: 存在性检测
    let element = null;
    try {
      element = await page.waitForSelector(feature.selector, { timeout: 5000 });
    } catch (e) {
      result.l1.message = `元素不存在: ${feature.selector}`;
      return result;
    }
    
    const isVisible = await element.isVisible();
    if (!isVisible) {
      await element.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      if (!(await element.isVisible())) {
        result.l1.message = '元素不可见（已尝试滚动）';
        return result;
      }
    }
    result.l1.pass = true;
    result.l1.message = '元素存在且可见';
    
    // L2: 可交互性检测
    const isEnabled = await element.isEnabled();
    if (!isEnabled) {
      result.l2.message = '元素被禁用';
      return result;
    }
    
    const box = await element.boundingBox();
    if (!box) {
      result.l2.message = '无法获取元素位置';
      return result;
    }
    result.l2.pass = true;
    result.l2.message = '元素可交互';
    
    // L3: 功能性检测
    const evidence = {
      networkRequests: [],
      consoleMessages: [],
      dialogAppeared: false,
      dialogMessage: '',
      urlBefore: page.url(),
      urlAfter: '',
      downloadTriggered: false
    };
    
    const requestHandler = req => evidence.networkRequests.push({ url: req.url(), method: req.method() });
    const consoleHandler = msg => evidence.consoleMessages.push(msg.text());
    const dialogHandler = async dialog => {
      evidence.dialogAppeared = true;
      evidence.dialogMessage = dialog.message();
      await dialog.accept();
    };
    const downloadHandler = () => { evidence.downloadTriggered = true; };
    
    page.on('request', requestHandler);
    page.on('console', consoleHandler);
    page.on('dialog', dialogHandler);
    page.on('download', downloadHandler);
    
    // 截图 - 使用任务ID确保文件名唯一
    const filePrefix = taskId ? `${taskId}_${index}` : `${index}`;
    const beforePath = join(screenshotsDir, `${filePrefix}_before.png`);
    await page.screenshot({ path: beforePath, fullPage: false });
    
    await element.click();
    await page.waitForTimeout(2000);
    
    evidence.urlAfter = page.url();
    
    const afterPath = join(screenshotsDir, `${filePrefix}_after.png`);
    await page.screenshot({ path: afterPath, fullPage: false });
    
    page.off('request', requestHandler);
    page.off('console', consoleHandler);
    page.off('dialog', dialogHandler);
    page.off('download', downloadHandler);
    
    result.evidence = evidence;
    
    // 程序化判断
    let programmaticResult = judgeProgrammatically(feature.type, evidence);
    
    if (programmaticResult.determined) {
      result.l3.pass = programmaticResult.pass;
      result.l3.message = programmaticResult.reason;
    } else {
      // AI 辅助判断
      console.log(`[L3] 程序化无法确定，调用 AI 辅助判断...`);
      const afterBase64 = readFileSync(afterPath).toString('base64');
      const aiResult = await judgeFeatureWithVision(
        feature.name, feature.type, feature.expectedBehavior, null, afterBase64
      );
      result.l3.pass = aiResult.pass;
      result.l3.message = `[AI辅助] ${aiResult.reason}`;
      result.suggestion = aiResult.suggestion;
    }
    
    if (result.l1.pass && result.l2.pass && result.l3.pass) {
      result.finalResult = 'pass';
    }
    
  } catch (error) {
    result.l3.message = `检测出错: ${error.message}`;
  }
  
  return result;
}

/**
 * 程序化判断函数
 */
function judgeProgrammatically(featureType, evidence) {
  const type = featureType.toLowerCase();
  
  if (type === 'share' || type === '分享') {
    if (evidence.dialogAppeared && /分享|share|复制|成功|链接/i.test(evidence.dialogMessage)) {
      return { determined: true, pass: true, reason: '弹出分享/复制确认弹窗' };
    }
    if (evidence.consoleMessages.some(m => /share|clipboard|分享|复制/i.test(m))) {
      return { determined: true, pass: true, reason: '检测到分享/剪贴板 API 调用' };
    }
    return { determined: false };
  }
  
  if (type === 'download' || type === '下载') {
    if (evidence.downloadTriggered) {
      return { determined: true, pass: true, reason: '成功触发文件下载' };
    }
    const downloadReq = evidence.networkRequests.find(r => /download|blob:|.pdf|.xlsx|.doc|.zip/i.test(r.url));
    if (downloadReq) {
      return { determined: true, pass: true, reason: `检测到下载请求` };
    }
    return { determined: true, pass: false, reason: '点击后未触发下载' };
  }
  
  if (type === 'link' || type === 'jump' || type === '跳转' || type === '链接') {
    if (evidence.urlBefore !== evidence.urlAfter) {
      return { determined: true, pass: true, reason: `URL 已跳转至: ${evidence.urlAfter}` };
    }
    return { determined: true, pass: false, reason: 'URL 未变化，跳转未生效' };
  }
  
  if (type === 'submit' || type === '提交') {
    const submitReq = evidence.networkRequests.find(r => r.method === 'POST' || r.method === 'PUT');
    if (submitReq) {
      return { determined: true, pass: true, reason: `检测到 ${submitReq.method} 请求` };
    }
    return { determined: true, pass: false, reason: '未检测到表单提交请求' };
  }
  
  if (type === 'button' || type === '按钮') {
    if (evidence.dialogAppeared) {
      return { determined: true, pass: true, reason: `弹出提示: ${evidence.dialogMessage}` };
    }
    if (evidence.networkRequests.length > 0) {
      return { determined: true, pass: true, reason: '检测到网络请求' };
    }
    return { determined: false };
  }
  
  return { determined: false };
}

/**
 * L4 布局质量检测（增强版）
 */
export async function checkLayoutQuality(page) {
  console.log('[L4] 开始布局质量检测...');
  
  const l4Result = {
    pass: true,
    issues: [],
    visionAnalysis: null,
    checkedAt: new Date().toISOString()
  };
  
  try {
    // 阶段1: 程序化检测
    console.log('[L4] 阶段1: 程序化检测...');
    
    // 1. 检测文字截断
    try {
      const truncationIssues = await checkTextTruncation(page);
      if (truncationIssues.length > 0) {
        l4Result.issues.push(...truncationIssues);
        console.log(`[L4] 发现 ${truncationIssues.length} 处文字截断问题`);
      }
    } catch (e) {
      console.error('[L4] 文字截断检测失败:', e.message);
    }
    
    // 2. 检测元素遮挡（增强版）
    try {
      const overlapIssues = await checkElementOverlap(page);
      if (overlapIssues.length > 0) {
        l4Result.issues.push(...overlapIssues);
        console.log(`[L4] 发现 ${overlapIssues.length} 处元素遮挡问题`);
      }
    } catch (e) {
      console.error('[L4] 元素遮挡检测失败:', e.message);
    }
    
    // 3. 检测内容溢出
    try {
      const overflowIssues = await checkOverflow(page);
      if (overflowIssues.length > 0) {
        l4Result.issues.push(...overflowIssues);
        console.log(`[L4] 发现 ${overflowIssues.length} 处内容溢出问题`);
      }
    } catch (e) {
      console.error('[L4] 内容溢出检测失败:', e.message);
    }
    
    // 4. 检测图表完整性
    try {
      const chartIssues = await checkChartCompleteness(page);
      if (chartIssues.length > 0) {
        l4Result.issues.push(...chartIssues);
        console.log(`[L4] 发现 ${chartIssues.length} 处图表完整性问题`);
      }
    } catch (e) {
      console.error('[L4] 图表完整性检测失败:', e.message);
    }
    
    // 5. 检测边界溢出
    try {
      const boundaryIssues = await checkBoundaryOverflow(page);
      if (boundaryIssues.length > 0) {
        l4Result.issues.push(...boundaryIssues);
        console.log(`[L4] 发现 ${boundaryIssues.length} 处边界溢出问题`);
      }
    } catch (e) {
      console.error('[L4] 边界溢出检测失败:', e.message);
    }
    
    console.log(`[L4] 阶段1完成: 程序化检测发现 ${l4Result.issues.length} 个问题`);
    
    // 阶段2: 视觉模型深度分析
    const enableVision = process.env.L4_VISION_ANALYSIS !== 'false';
    
    if (enableVision) {
      console.log('[L4] 阶段2: 视觉模型深度分析...');
      try {
        const screenshotBuffer = await page.screenshot({ fullPage: true });
        const screenshotBase64 = screenshotBuffer.toString('base64');
        
        const visionResult = await analyzeLayoutWithVision(screenshotBase64, l4Result.issues);
        l4Result.visionAnalysis = visionResult;
        
        if (visionResult.hasIssues && visionResult.issues) {
          for (const issue of visionResult.issues) {
            const isDuplicate = l4Result.issues.some(existing => 
              existing.type === issue.type && existing.element === issue.element
            );
            if (!isDuplicate) {
              l4Result.issues.push({ ...issue, source: 'vision' });
            }
          }
        }
        console.log(`[L4] 阶段2完成: 视觉分析${visionResult.hasIssues ? '发现问题' : '无新问题'}`);
      } catch (e) {
        console.error('[L4] 视觉分析失败:', e.message);
        l4Result.visionAnalysis = { error: e.message };
      }
    } else {
      console.log('[L4] 阶段2跳过: 视觉分析已禁用');
    }
    
    // 判断是否通过
    const criticalIssues = l4Result.issues.filter(i => i.severity === 'high' || i.severity === 'medium');
    l4Result.pass = criticalIssues.length === 0;
    
    console.log(`[L4] 布局检测完成: ${l4Result.pass ? '✅ 通过' : '❌ 发现问题'} (${l4Result.issues.length} 个问题)`);
    
  } catch (error) {
    console.error('[L4 错误]', error.message);
    l4Result.error = error.message;
  }
  
  return l4Result;
}

/**
 * 检测文字截断
 */
async function checkTextTruncation(page) {
  return await page.evaluate(() => {
    const issues = [];
    const textElements = document.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6, div, li');
    
    textElements.forEach(el => {
      if (!el.textContent.trim() || el.offsetHeight === 0) return;
      
      const style = getComputedStyle(el);
      const isOverflowHidden = style.overflow === 'hidden' || 
                                style.overflowY === 'hidden' ||
                                style.overflowX === 'hidden' ||
                                style.textOverflow === 'ellipsis';
      
      if (isOverflowHidden && el.scrollHeight > el.clientHeight + 2) {
        const className = el.className ? '.' + el.className.split(' ')[0] : '';
        issues.push({
          type: 'text_truncated',
          element: el.tagName + className,
          text: el.textContent.substring(0, 50) + (el.textContent.length > 50 ? '...' : ''),
          reason: '文字超出容器高度被截断',
          severity: 'medium',
          location: `top:${el.getBoundingClientRect().top.toFixed(0)}px`
        });
      }
      
      if (isOverflowHidden && el.scrollWidth > el.clientWidth + 2) {
        issues.push({
          type: 'text_truncated',
          element: el.tagName,
          text: el.textContent.substring(0, 50) + (el.textContent.length > 50 ? '...' : ''),
          reason: '文字超出容器宽度被截断',
          severity: 'medium',
          location: `left:${el.getBoundingClientRect().left.toFixed(0)}px`
        });
      }
    });
    
    return issues;
  });
}

/**
 * 检测元素遮挡（增强版：多点采样 + 图例检测）
 */
async function checkElementOverlap(page) {
  return await page.evaluate(() => {
    const issues = [];
    
    // 1. 检测重要UI元素被遮挡
    const importantElements = document.querySelectorAll(
      'h1, h2, h3, h4, h5, h6, p, span, a, button, label, ' +
      'svg text, svg rect, svg path, svg circle'
    );
    
    importantElements.forEach(el => {
      if (el.offsetHeight === 0 && el.getBoundingClientRect().height === 0) return;
      
      const rect = el.getBoundingClientRect();
      if (rect.width < 5 || rect.height < 5) return;
      
      const padding = Math.min(3, rect.width / 4, rect.height / 4);
      const checkPoints = [
        { x: rect.left + padding, y: rect.top + padding },
        { x: rect.right - padding, y: rect.top + padding },
        { x: rect.left + padding, y: rect.bottom - padding },
        { x: rect.right - padding, y: rect.bottom - padding },
        { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      ];
      
      let coveredCount = 0;
      let coveringElement = null;
      
      for (const point of checkPoints) {
        if (point.x < 0 || point.y < 0 || point.x > window.innerWidth || point.y > window.innerHeight) continue;
        
        const topElement = document.elementFromPoint(point.x, point.y);
        
        if (topElement && topElement !== el && !el.contains(topElement) && !topElement.contains(el)) {
          const style = getComputedStyle(topElement);
          const hasBg = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
          const hasContent = topElement.textContent?.trim().length > 0 ||
                            ['IMG', 'VIDEO', 'CANVAS', 'SVG'].includes(topElement.tagName);
          
          if (hasBg || hasContent) {
            coveredCount++;
            coveringElement = topElement;
          }
        }
      }
      
      if (coveredCount >= 2 && coveringElement) {
        const elText = el.textContent?.substring(0, 40).trim() || el.tagName;
        const coverText = coveringElement.textContent?.substring(0, 20).trim() || '';
        
        issues.push({
          type: 'element_covered',
          element: el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : ''),
          text: elText,
          coveredBy: coveringElement.tagName + (coverText ? ` ("${coverText}")` : ''),
          reason: '元素被其他内容遮挡',
          severity: 'high',
          location: `top:${rect.top.toFixed(0)}px, left:${rect.left.toFixed(0)}px`
        });
      }
    });
    
    // 2. 检测图例与图表数据区域的重叠
    const legends = document.querySelectorAll(
      '[class*="legend"], [class*="Legend"], .recharts-legend-wrapper, .echarts-legend'
    );
    const chartAreas = document.querySelectorAll(
      '[class*="chart"], [class*="Chart"], svg, canvas, .recharts-wrapper, .echarts'
    );
    
    legends.forEach(legend => {
      const legendRect = legend.getBoundingClientRect();
      if (legendRect.width === 0 || legendRect.height === 0) return;
      
      chartAreas.forEach(chart => {
        if (legend.contains(chart) || chart.contains(legend)) return;
        
        const chartRect = chart.getBoundingClientRect();
        if (chartRect.width === 0 || chartRect.height === 0) return;
        
        const overlap = !(legendRect.right < chartRect.left || 
                         legendRect.left > chartRect.right || 
                         legendRect.bottom < chartRect.top || 
                         legendRect.top > chartRect.bottom);
        
        if (overlap) {
          const overlapWidth = Math.min(legendRect.right, chartRect.right) - Math.max(legendRect.left, chartRect.left);
          const overlapHeight = Math.min(legendRect.bottom, chartRect.bottom) - Math.max(legendRect.top, chartRect.top);
          const overlapArea = overlapWidth * overlapHeight;
          const chartArea = chartRect.width * chartRect.height;
          
          if (overlapArea > chartArea * 0.05) {
            issues.push({
              type: 'legend_overlap_chart',
              element: 'Legend',
              coveredBy: chart.tagName,
              reason: `图例与图表区域重叠 (${((overlapArea / chartArea) * 100).toFixed(1)}%)`,
              severity: 'high',
              location: `legend at top:${legendRect.top.toFixed(0)}px`
            });
          }
        }
      });
    });
    
    return issues;
  });
}

/**
 * 检测内容溢出
 */
async function checkOverflow(page) {
  return await page.evaluate(() => {
    const issues = [];
    const containers = document.querySelectorAll('div, section, article, main');
    
    containers.forEach(el => {
      if (el.offsetHeight === 0) return;
      
      const rect = el.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      
      if (rect.right > viewportWidth + 10) {
        issues.push({
          type: 'overflow',
          element: el.tagName + (el.className ? '.' + el.className.split(' ')[0] : ''),
          reason: `元素超出视口右侧 ${(rect.right - viewportWidth).toFixed(0)}px`,
          severity: 'low',
          location: 'right overflow'
        });
      }
    });
    
    return issues;
  });
}

/**
 * 检测图表完整性
 */
async function checkChartCompleteness(page) {
  return await page.evaluate(() => {
    const issues = [];
    
    // 检测 SVG 图表
    const svgs = document.querySelectorAll('svg');
    svgs.forEach(svg => {
      const rect = svg.getBoundingClientRect();
      if (rect.width < 50 || rect.height < 50) return;
      
      let parent = svg.parentElement;
      while (parent && parent !== document.body) {
        const parentRect = parent.getBoundingClientRect();
        const parentStyle = getComputedStyle(parent);
        
        if (parentStyle.overflow === 'hidden' || parentStyle.overflow === 'clip') {
          if (rect.left < parentRect.left - 5 || rect.right > parentRect.right + 5 ||
              rect.top < parentRect.top - 5 || rect.bottom > parentRect.bottom + 5) {
            issues.push({
              type: 'chart_clipped',
              element: 'SVG Chart',
              reason: `图表被父容器裁切`,
              severity: 'high',
              location: `svg at top:${rect.top.toFixed(0)}px`
            });
            break;
          }
        }
        parent = parent.parentElement;
      }
      
      // 检测 viewBox 与实际尺寸
      const viewBox = svg.getAttribute('viewBox');
      if (viewBox) {
        const parts = viewBox.split(/[\s,]+/).map(Number);
        if (parts.length === 4) {
          const [, , vbWidth, vbHeight] = parts;
          const aspectRatio = vbWidth / vbHeight;
          const actualRatio = rect.width / rect.height;
          
          if (Math.abs(aspectRatio - actualRatio) > 0.5) {
            issues.push({
              type: 'chart_distorted',
              element: 'SVG Chart',
              reason: `图表可能被压缩或拉伸`,
              severity: 'medium',
              location: `svg at top:${rect.top.toFixed(0)}px`
            });
          }
        }
      }
    });
    
    // 检测 Canvas
    const canvases = document.querySelectorAll('canvas');
    canvases.forEach(canvas => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 50 || rect.height < 50) return;
      
      let parent = canvas.parentElement;
      while (parent && parent !== document.body) {
        const parentRect = parent.getBoundingClientRect();
        const parentStyle = getComputedStyle(parent);
        
        if (parentStyle.overflow === 'hidden') {
          if (rect.right > parentRect.right + 5 || rect.bottom > parentRect.bottom + 5) {
            issues.push({
              type: 'chart_clipped',
              element: 'Canvas Chart',
              reason: '画布被父容器裁切',
              severity: 'high',
              location: `canvas at top:${rect.top.toFixed(0)}px`
            });
            break;
          }
        }
        parent = parent.parentElement;
      }
    });
    
    return issues;
  });
}

/**
 * 检测元素边界溢出
 */
async function checkBoundaryOverflow(page) {
  return await page.evaluate(() => {
    const issues = [];
    
    const elements = document.querySelectorAll(
      'img, svg, canvas, video, iframe, [class*="chart"], [class*="graph"], [class*="pie"]'
    );
    
    elements.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 20) return;
      
      const parent = el.parentElement;
      if (!parent) return;
      
      const parentRect = parent.getBoundingClientRect();
      const parentStyle = getComputedStyle(parent);
      
      if (parentStyle.overflow === 'hidden' || parentStyle.overflow === 'clip') {
        const overflowLeft = parentRect.left - rect.left;
        const overflowRight = rect.right - parentRect.right;
        const overflowTop = parentRect.top - rect.top;
        const overflowBottom = rect.bottom - parentRect.bottom;
        
        const maxOverflow = Math.max(overflowLeft, overflowRight, overflowTop, overflowBottom);
        
        if (maxOverflow > 10) {
          issues.push({
            type: 'element_overflow',
            element: el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : ''),
            reason: `元素超出容器边界 ${maxOverflow.toFixed(0)}px`,
            severity: maxOverflow > 50 ? 'high' : 'medium',
            location: `element at top:${rect.top.toFixed(0)}px`
          });
        }
      }
    });
    
    return issues;
  });
}
