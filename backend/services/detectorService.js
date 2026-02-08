/**
 * 检测服务 - 使用 Playwright 执行功能检测
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, readFileSync } from 'fs';
import { identifyFeatures, judgeFeatureWithVision } from './aiService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const screenshotsDir = join(__dirname, '..', 'screenshots');

/**
 * 从 URL 检测 Case
 * @param {string} url - Case URL
 * @returns {Promise<Object>} 检测报告
 */
export async function detectFromUrl(url) {
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
    layoutQuality: null,  // L4 布局质量检测结果
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      passRate: 0,
      layoutIssues: 0
    }
  };
  
  try {
    // 加载页面 - 使用更宽松的加载策略，避免动态页面超时
    console.log('[Step 1] 加载页面...');
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      // 如果 domcontentloaded 也超时，尝试不等待
      console.log('[Step 1] 页面加载较慢，继续尝试...');
      await page.goto(url, { waitUntil: 'commit', timeout: 15000 });
    }
    
    // 等待页面完全渲染
    console.log('[Step 1.1] 等待页面渲染完成...');
    await page.waitForTimeout(3000);
    
    // 尝试等待网络空闲，但不阻塞
    try {
      await page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch (e) {
      console.log('[Step 1.1] 网络未完全空闲，继续检测...');
    }
    
    // 获取页面 HTML
    const html = await page.content();
    console.log(`[Step 1.2] 获取页面HTML，长度: ${html.length} 字符`);
    
    // AI 识别功能点
    console.log('[Step 2] AI 识别功能点...');
    const features = await identifyFeatures(html);
    console.log(`[Step 2] 识别到 ${features.length} 个功能点`);
    
    // 逐一检测功能点
    console.log('[Step 3] 开始逐一检测功能点...');
    for (let i = 0; i < features.length; i++) {
      const feature = features[i];
      console.log(`[Step 3.${i + 1}] 检测: ${feature.name}`);
      
      const result = await detectFeature(page, feature, i);
      report.features.push(result);
    }
    
    // L4: 布局质量检测
    console.log('[Step 4] 执行 L4 布局质量检测...');
    report.layoutQuality = await checkLayoutQuality(page);
    
    // 生成统计
    report.summary.total = report.features.length;
    report.summary.passed = report.features.filter(f => f.finalResult === 'pass').length;
    report.summary.failed = report.summary.total - report.summary.passed;
    report.summary.passRate = report.summary.total > 0 
      ? Math.round((report.summary.passed / report.summary.total) * 100) 
      : 0;
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
 * @param {string} html - HTML 代码
 * @returns {Promise<Object>} 检测报告
 */
export async function detectFromHtml(html) {
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
    layoutQuality: null,  // L4 布局质量检测结果
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      passRate: 0,
      layoutIssues: 0
    }
  };
  
  try {
    // 加载 HTML
    console.log('[Step 1] 加载 HTML...');
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    // AI 识别功能点
    console.log('[Step 2] AI 识别功能点...');
    const features = await identifyFeatures(html);
    console.log(`[Step 2] 识别到 ${features.length} 个功能点`);
    
    // 逐一检测功能点
    console.log('[Step 3] 开始逐一检测功能点...');
    for (let i = 0; i < features.length; i++) {
      const feature = features[i];
      console.log(`[Step 3.${i + 1}] 检测: ${feature.name}`);
      
      const result = await detectFeature(page, feature, i);
      report.features.push(result);
    }
    
    // L4: 布局质量检测
    console.log('[Step 4] 执行 L4 布局质量检测...');
    report.layoutQuality = await checkLayoutQuality(page);
    
    // 生成统计
    report.summary.total = report.features.length;
    report.summary.passed = report.features.filter(f => f.finalResult === 'pass').length;
    report.summary.failed = report.summary.total - report.summary.passed;
    report.summary.passRate = report.summary.total > 0 
      ? Math.round((report.summary.passed / report.summary.total) * 100) 
      : 0;
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
 * 检测单个功能点
 * 基于 Skills 文档 4.2-4.6 节：程序化检测为主 + AI 辅助判断
 * @param {Page} page - Playwright 页面对象
 * @param {Object} feature - 功能点信息
 * @param {number} index - 索引
 * @returns {Promise<Object>} 检测结果
 */
async function detectFeature(page, feature, index) {
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
    evidence: {}  // 新增：程序化证据
  };
  
  try {
    // ========== L1: 存在性检测（增加等待和重试） ==========
    let element = null;
    try {
      // 等待元素出现，最多等 5 秒
      element = await page.waitForSelector(feature.selector, { timeout: 5000 });
    } catch (e) {
      result.l1.message = `元素不存在: ${feature.selector}`;
      return result;
    }
    
    const isVisible = await element.isVisible();
    if (!isVisible) {
      // 尝试滚动到元素位置
      await element.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      const stillNotVisible = !(await element.isVisible());
      if (stillNotVisible) {
        result.l1.message = '元素不可见（已尝试滚动）';
        return result;
      }
    }
    
    result.l1.pass = true;
    result.l1.message = '元素存在且可见';
    
    // ========== L2: 可交互性检测 ==========
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
    
    // ========== L3: 功能性检测（程序化为主 + AI 辅助） ==========
    
    // 初始化证据收集器
    const evidence = {
      networkRequests: [],
      consoleMessages: [],
      dialogAppeared: false,
      dialogMessage: '',
      urlBefore: page.url(),
      urlAfter: '',
      downloadTriggered: false,
      domChanged: false
    };
    
    // 启动监听器
    const requestHandler = req => evidence.networkRequests.push({
      url: req.url(),
      method: req.method()
    });
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
    
    // 截图 - 操作前
    const beforePath = join(screenshotsDir, `${index}_before.png`);
    await page.screenshot({ path: beforePath, fullPage: false });
    
    // 执行点击
    console.log(`[L3] 执行点击: ${feature.name}`);
    await element.click();
    await page.waitForTimeout(2000);
    
    // 记录点击后状态
    evidence.urlAfter = page.url();
    
    // 截图 - 操作后
    const afterPath = join(screenshotsDir, `${index}_after.png`);
    await page.screenshot({ path: afterPath, fullPage: false });
    
    // 移除监听器
    page.off('request', requestHandler);
    page.off('console', consoleHandler);
    page.off('dialog', dialogHandler);
    page.off('download', downloadHandler);
    
    // 保存证据
    result.evidence = evidence;
    
    console.log(`[L3] 证据收集:`, {
      requests: evidence.networkRequests.length,
      dialog: evidence.dialogAppeared,
      urlChanged: evidence.urlBefore !== evidence.urlAfter,
      download: evidence.downloadTriggered
    });
    
    // ========== 程序化判断（根据功能类型） ==========
    let programmaticResult = judgeProgrammatically(feature.type, evidence, page);
    
    if (programmaticResult.determined) {
      // 程序化已经确定结果
      result.l3.pass = programmaticResult.pass;
      result.l3.message = programmaticResult.reason;
      console.log(`[L3] 程序化判断: ${programmaticResult.pass ? '✅ 通过' : '❌ 失败'} - ${programmaticResult.reason}`);
    } else {
      // 程序化无法确定，调用 AI 辅助
      console.log(`[L3] 程序化无法确定，调用 AI 辅助判断...`);
      const afterBase64 = readFileSync(afterPath).toString('base64');
      const aiResult = await judgeFeatureWithVision(
        feature.name,
        feature.type,
        feature.expectedBehavior,
        null,
        afterBase64
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
    console.error(`[L3错误]`, error.message);
  }
  
  return result;
}

/**
 * 程序化判断函数
 * 基于 Skills 文档 4.5 节的判断逻辑
 */
function judgeProgrammatically(featureType, evidence, page) {
  const type = featureType.toLowerCase();
  
  // 分享功能
  if (type === 'share' || type === '分享') {
    if (evidence.dialogAppeared && /分享|share|复制|成功|链接/i.test(evidence.dialogMessage)) {
      return { determined: true, pass: true, reason: '弹出分享/复制确认弹窗' };
    }
    if (evidence.consoleMessages.some(m => /share|clipboard|分享|复制/i.test(m))) {
      return { determined: true, pass: true, reason: '检测到分享/剪贴板 API 调用' };
    }
    // 无法确定，需要 AI 辅助
    return { determined: false };
  }
  
  // 下载功能
  if (type === 'download' || type === '下载') {
    if (evidence.downloadTriggered) {
      return { determined: true, pass: true, reason: '成功触发文件下载' };
    }
    const downloadReq = evidence.networkRequests.find(r => 
      /download|blob:|.pdf|.xlsx|.doc|.zip/i.test(r.url)
    );
    if (downloadReq) {
      return { determined: true, pass: true, reason: `检测到下载请求: ${downloadReq.url.substring(0, 50)}` };
    }
    return { determined: true, pass: false, reason: '点击后未触发下载' };
  }
  
  // 跳转/链接功能
  if (type === 'link' || type === 'jump' || type === '跳转' || type === '链接') {
    if (evidence.urlBefore !== evidence.urlAfter) {
      return { determined: true, pass: true, reason: `URL 已跳转至: ${evidence.urlAfter}` };
    }
    return { determined: true, pass: false, reason: 'URL 未变化，跳转未生效' };
  }
  
  // 表单提交
  if (type === 'submit' || type === '提交') {
    const submitReq = evidence.networkRequests.find(r => 
      r.method === 'POST' || r.method === 'PUT'
    );
    if (submitReq) {
      return { determined: true, pass: true, reason: `检测到 ${submitReq.method} 请求` };
    }
    return { determined: true, pass: false, reason: '未检测到表单提交请求' };
  }
  
  // 重置功能 - 需要 AI 辅助确认
  if (type === 'reset' || type === '重置') {
    return { determined: false };
  }
  
  // 视频播放 - 需要程序化检查视频状态
  if (type === 'video' || type === '视频') {
    // 返回未确定，会在上层通过 page.evaluate 检查
    return { determined: false };
  }
  
  // 按钮/其他类型 - 检查是否有任何响应
  if (type === 'button' || type === '按钮') {
    if (evidence.dialogAppeared) {
      return { determined: true, pass: true, reason: `弹出提示: ${evidence.dialogMessage}` };
    }
    if (evidence.networkRequests.length > 0) {
      return { determined: true, pass: true, reason: '检测到网络请求' };
    }
    // 无法确定
    return { determined: false };
  }
  
  // 默认：无法程序化判断，需要 AI 辅助
  return { determined: false };
}

/**
 * L4 布局质量检测
 * 基于 Skills 文档 4.7 节：检测 UI 元素是否完整显示、无遮挡、无截断
 * @param {Page} page - Playwright 页面对象
 * @returns {Promise<Object>} L4 检测结果
 */
export async function checkLayoutQuality(page) {
  console.log('[L4] 开始布局质量检测...');
  
  const l4Result = {
    pass: true,
    issues: [],
    checkedAt: new Date().toISOString()
  };
  
  try {
    // 4.7.2 程序化检测方法
    
    // 1. 检测文字截断
    const truncationIssues = await checkTextTruncation(page);
    if (truncationIssues.length > 0) {
      l4Result.issues.push(...truncationIssues);
      console.log(`[L4] 发现 ${truncationIssues.length} 处文字截断问题`);
    }
    
    // 2. 检测元素遮挡
    const overlapIssues = await checkElementOverlap(page);
    if (overlapIssues.length > 0) {
      l4Result.issues.push(...overlapIssues);
      console.log(`[L4] 发现 ${overlapIssues.length} 处元素遮挡问题`);
    }
    
    // 3. 检测内容溢出
    const overflowIssues = await checkOverflow(page);
    if (overflowIssues.length > 0) {
      l4Result.issues.push(...overflowIssues);
      console.log(`[L4] 发现 ${overflowIssues.length} 处内容溢出问题`);
    }
    
    // 判断 L4 是否通过（有高/中等严重度问题则不通过）
    const criticalIssues = l4Result.issues.filter(i => 
      i.severity === 'high' || i.severity === 'medium'
    );
    l4Result.pass = criticalIssues.length === 0;
    
    console.log(`[L4] 布局检测完成: ${l4Result.pass ? '✅ 通过' : '❌ 发现问题'}`);
    
  } catch (error) {
    console.error('[L4 错误]', error.message);
    l4Result.error = error.message;
  }
  
  return l4Result;
}

/**
 * 检测文字是否被截断
 */
async function checkTextTruncation(page) {
  return await page.evaluate(() => {
    const issues = [];
    const textElements = document.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6, div, li');
    
    textElements.forEach(el => {
      // 跳过空元素和隐藏元素
      if (!el.textContent.trim() || el.offsetHeight === 0) return;
      
      const style = getComputedStyle(el);
      const isOverflowHidden = style.overflow === 'hidden' || 
                                style.overflowY === 'hidden' ||
                                style.overflowX === 'hidden' ||
                                style.textOverflow === 'ellipsis';
      
      // 检测垂直方向截断
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
      
      // 检测横向截断
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
 * 检测元素是否被遮挡（多点采样检测）
 */
async function checkElementOverlap(page) {
  return await page.evaluate(() => {
    const issues = [];
    const textElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, a, button, label');
    
    textElements.forEach(el => {
      if (!el.textContent.trim() || el.offsetHeight === 0) return;
      
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      
      // 多点采样检测：检测四个角 + 中心点
      const padding = Math.min(5, rect.width / 4, rect.height / 4);
      const checkPoints = [
        { x: rect.left + padding, y: rect.top + padding },           // 左上
        { x: rect.right - padding, y: rect.top + padding },          // 右上
        { x: rect.left + padding, y: rect.bottom - padding },        // 左下
        { x: rect.right - padding, y: rect.bottom - padding },       // 右下
        { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }  // 中心
      ];
      
      let coveredCount = 0;
      let coveringElement = null;
      
      for (const point of checkPoints) {
        // 跳过视口外的点
        if (point.x < 0 || point.y < 0 || 
            point.x > window.innerWidth || point.y > window.innerHeight) {
          continue;
        }
        
        const topElement = document.elementFromPoint(point.x, point.y);
        
        if (topElement && 
            topElement !== el && 
            !el.contains(topElement) && 
            !topElement.contains(el)) {
          
          const tagName = topElement.tagName;
          // 判断是否被图片、视频、canvas 等媒体元素遮挡
          if (tagName === 'IMG' || tagName === 'VIDEO' || 
              tagName === 'CANVAS' || tagName === 'SVG' ||
              (tagName === 'DIV' && topElement.querySelector('img, video, canvas'))) {
            coveredCount++;
            coveringElement = topElement;
          }
        }
      }
      
      // 如果超过 2 个检测点被遮挡，认为元素被遮挡
      if (coveredCount >= 2 && coveringElement) {
        issues.push({
          type: 'element_covered',
          element: el.tagName,
          text: el.textContent.substring(0, 40).trim(),
          coveredBy: coveringElement.tagName,
          reason: `文字被 ${coveringElement.tagName} 元素遮挡`,
          severity: 'high',
          location: `top:${rect.top.toFixed(0)}px, left:${rect.left.toFixed(0)}px`
        });
      }
    });
    
    return issues;
  });
}

/**
 * 检测内容是否溢出容器
 */
async function checkOverflow(page) {
  return await page.evaluate(() => {
    const issues = [];
    const containers = document.querySelectorAll('div, section, article, main');
    
    containers.forEach(el => {
      if (el.offsetHeight === 0) return;
      
      const rect = el.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // 检测是否超出视口右侧
      if (rect.right > viewportWidth + 10) {
        issues.push({
          type: 'overflow',
          element: el.tagName + (el.className ? '.' + el.className.split(' ')[0] : ''),
          reason: `元素超出视口右侧 ${(rect.right - viewportWidth).toFixed(0)}px`,
          severity: 'low',
          location: `right overflow`
        });
      }
      
      // 检测是否超出视口底部（仅针对非滚动容器）
      const style = getComputedStyle(el);
      if (style.overflow !== 'auto' && style.overflow !== 'scroll') {
        if (rect.bottom > viewportHeight + 100 && rect.height < viewportHeight) {
          // 这可能是正常的长页面，仅记录但不标为问题
        }
      }
    });
    
    return issues;
  });
}

