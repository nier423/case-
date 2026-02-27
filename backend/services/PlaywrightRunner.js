/**
 * PlaywrightRunner - Playwright 动态渲染引擎核心模块
 * 职责：浏览器生命周期管理 + Evidence 自动收集 + L3 功能性检测
 * 
 * 设计原则：
 * 1. 与现有 detectorService.js 解耦，可独立使用
 * 2. Evidence 收集器符合文档 4.4 节规范
 * 3. L3 检测逻辑符合文档 4.5 节程序化判断规范
 * 4. 监听器生命周期自动管理，防止内存泄漏
 */

import { chromium } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const screenshotsDir = join(__dirname, '..', 'screenshots');

// 确保截图目录存在
if (!existsSync(screenshotsDir)) {
  mkdirSync(screenshotsDir, { recursive: true });
}

/**
 * @typedef {Object} Evidence
 * @property {Array<{url: string, method: string, status?: number}>} networkRequests
 * @property {Array<string>} consoleMessages
 * @property {boolean} dialogAppeared
 * @property {string} dialogMessage
 * @property {string} urlBefore
 * @property {string} urlAfter
 * @property {boolean} downloadTriggered
 * @property {Object|null} videoStateChange
 */

/**
 * @typedef {Object} L3TestResult
 * @property {boolean} pass - 是否通过
 * @property {string} reason - 判断理由
 * @property {boolean} [needs_ai_assist] - 是否需要 AI 辅助判断
 * @property {Buffer} [screenshotBefore] - 操作前截图
 * @property {Buffer} [screenshotAfter] - 操作后截图
 * @property {Evidence} [evidence] - 收集到的证据
 */

class PlaywrightRunner {
  
  // ==================== 私有属性 ====================
  #browser = null;
  #context = null;
  #page = null;
  #evidence = null;
  #listeners = new Map();
  #isCollecting = false;
  
  // ==================== 配置 ====================
  static DEFAULT_VIEWPORT = { width: 1280, height: 800 };
  static DEFAULT_TIMEOUT = 30000;
  static POST_CLICK_WAIT = 2000;  // 点击后等待时间

  // ==================== 生命周期管理 ====================
  
  /**
   * 启动浏览器实例
   * @param {Object} options - 启动选项
   * @param {boolean} [options.headless=true] - 是否无头模式
   * @param {Object} [options.viewport] - 视口尺寸
   * @returns {Promise<void>}
   */
  async launch(options = {}) {
    const { headless = true, viewport = PlaywrightRunner.DEFAULT_VIEWPORT } = options;
    
    this.#browser = await chromium.launch({ headless });
    this.#context = await this.#browser.newContext({ viewport });
    this.#page = await this.#context.newPage();
    
    console.log('[PlaywrightRunner] 浏览器已启动');
  }
  
  /**
   * 关闭浏览器并清理资源
   * @returns {Promise<void>}
   */
  async close() {
    // 确保移除所有监听器
    if (this.#isCollecting) {
      this.stopEvidenceCollection();
    }
    
    if (this.#browser) {
      await this.#browser.close();
      this.#browser = null;
      this.#context = null;
      this.#page = null;
      console.log('[PlaywrightRunner] 浏览器已关闭');
    }
  }
  
  /**
   * 导航到指定 URL
   * @param {string} url - 目标 URL
   * @param {Object} [options] - 导航选项
   * @returns {Promise<void>}
   */
  async goto(url, options = {}) {
    const { timeout = PlaywrightRunner.DEFAULT_TIMEOUT } = options;
    
    try {
      await this.#page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    } catch (e) {
      console.log('[PlaywrightRunner] 页面加载较慢，使用 commit 策略...');
      await this.#page.goto(url, { waitUntil: 'commit', timeout: 15000 });
    }
    
    // 等待页面渲染
    await this.#page.waitForTimeout(2000);
    
    // 尝试等待网络空闲
    try {
      await this.#page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch (e) {
      console.log('[PlaywrightRunner] 网络未完全空闲，继续执行...');
    }
  }
  
  /**
   * 加载 HTML 内容
   * @param {string} html - HTML 字符串
   * @returns {Promise<void>}
   */
  async setContent(html) {
    await this.#page.setContent(html, { waitUntil: 'networkidle' });
    await this.#page.waitForTimeout(1000);
  }

  // ==================== Evidence 收集器 ====================
  
  /**
   * 初始化空的 Evidence 对象
   * @private
   * @returns {Evidence}
   */
  #createEmptyEvidence() {
    return {
      networkRequests: [],
      consoleMessages: [],
      dialogAppeared: false,
      dialogMessage: '',
      urlBefore: '',
      urlAfter: '',
      downloadTriggered: false,
      videoStateChange: null
    };
  }
  
  /**
   * 启动 Evidence 收集
   * @returns {void}
   */
  startEvidenceCollection() {
    if (this.#isCollecting) {
      console.warn('[PlaywrightRunner] Evidence 收集已在进行中');
      return;
    }
    
    this.#evidence = this.#createEmptyEvidence();
    this.#evidence.urlBefore = this.#page.url();
    
    // 绑定监听器（保存引用以便移除）
    const requestHandler = this.#onRequest.bind(this);
    const consoleHandler = this.#onConsole.bind(this);
    const dialogHandler = this.#onDialog.bind(this);
    const downloadHandler = this.#onDownload.bind(this);
    
    this.#listeners.set('request', requestHandler);
    this.#listeners.set('console', consoleHandler);
    this.#listeners.set('dialog', dialogHandler);
    this.#listeners.set('download', downloadHandler);
    
    this.#page.on('request', requestHandler);
    this.#page.on('console', consoleHandler);
    this.#page.on('dialog', dialogHandler);
    this.#page.on('download', downloadHandler);
    
    this.#isCollecting = true;
    console.log('[PlaywrightRunner] Evidence 收集已启动');
  }
  
  /**
   * 停止 Evidence 收集并返回结果
   * @returns {Evidence}
   */
  stopEvidenceCollection() {
    if (!this.#isCollecting) {
      console.warn('[PlaywrightRunner] Evidence 收集未启动');
      return this.#createEmptyEvidence();
    }
    
    // 记录最终 URL
    this.#evidence.urlAfter = this.#page.url();
    
    // 移除所有监听器
    for (const [event, handler] of this.#listeners) {
      this.#page.off(event, handler);
    }
    this.#listeners.clear();
    
    this.#isCollecting = false;
    console.log('[PlaywrightRunner] Evidence 收集已停止');
    
    return { ...this.#evidence };
  }
  
  /**
   * 获取当前 Evidence 快照（不停止收集）
   * @returns {Evidence}
   */
  getEvidenceSnapshot() {
    if (!this.#evidence) {
      return this.#createEmptyEvidence();
    }
    return {
      ...this.#evidence,
      urlAfter: this.#page.url()
    };
  }

  // ==================== 私有监听器 ====================
  
  /** @private */
  #onRequest(request) {
    this.#evidence.networkRequests.push({
      url: request.url(),
      method: request.method()
    });
  }
  
  /** @private */
  #onConsole(message) {
    try {
      this.#evidence.consoleMessages.push(message.text());
    } catch (e) {
      // 某些 console 消息可能无法获取文本
    }
  }
  
  /** @private */
  async #onDialog(dialog) {
    this.#evidence.dialogAppeared = true;
    this.#evidence.dialogMessage = dialog.message();
    await dialog.accept();
  }
  
  /** @private */
  #onDownload(download) {
    this.#evidence.downloadTriggered = true;
  }

  // ==================== L3 功能性检测 ====================
  
  /**
   * 执行 L3 功能性检测
   * @param {string} elementSelector - 元素选择器
   * @param {string} actionType - 功能类型 (share/download/link/video/reset/submit/button)
   * @param {string} expectedBehavior - 预期行为描述
   * @returns {Promise<L3TestResult>}
   */
  async executeL3Test(elementSelector, actionType, expectedBehavior) {
    const result = {
      pass: false,
      reason: '',
      needs_ai_assist: false,
      screenshotBefore: null,
      screenshotAfter: null,
      evidence: null
    };
    
    try {
      // ========== 1. 定位元素 ==========
      let element = null;
      try {
        element = await this.#page.waitForSelector(elementSelector, { timeout: 5000 });
      } catch (e) {
        result.reason = `元素定位失败: ${elementSelector}`;
        return result;
      }
      
      // 检查元素可见性
      const isVisible = await element.isVisible();
      if (!isVisible) {
        await element.scrollIntoViewIfNeeded();
        await this.#page.waitForTimeout(500);
        if (!(await element.isVisible())) {
          result.reason = '元素不可见（已尝试滚动）';
          return result;
        }
      }
      
      // 检查元素是否可交互
      const isEnabled = await element.isEnabled();
      if (!isEnabled) {
        result.reason = '元素被禁用，无法点击';
        return result;
      }
      
      // ========== 2. 截图（操作前） ==========
      result.screenshotBefore = await this.#page.screenshot({ fullPage: false });
      
      // ========== 3. 启动 Evidence 收集 ==========
      this.startEvidenceCollection();
      
      // ========== 4. 执行点击操作 ==========
      console.log(`[L3Test] 执行点击: ${elementSelector}`);
      await element.click();
      
      // ========== 5. 强校验等待 ==========
      await this.#page.waitForTimeout(PlaywrightRunner.POST_CLICK_WAIT);
      
      // ========== 6. 停止收集并获取 Evidence ==========
      const evidence = this.stopEvidenceCollection();
      result.evidence = evidence;
      
      // ========== 7. 截图（操作后） ==========
      result.screenshotAfter = await this.#page.screenshot({ fullPage: false });
      
      // ========== 8. 程序化判断 ==========
      const judgmentResult = this.#judgeProgrammatically(actionType, evidence);
      
      result.pass = judgmentResult.pass;
      result.reason = judgmentResult.reason;
      result.needs_ai_assist = judgmentResult.needs_ai_assist || false;
      
      console.log(`[L3Test] 判断结果: ${result.pass ? '✅ 通过' : '❌ 失败'} - ${result.reason}`);
      
    } catch (error) {
      result.reason = `执行出错: ${error.message}`;
      console.error('[L3Test] 错误:', error.message);
      
      // 确保停止收集
      if (this.#isCollecting) {
        this.stopEvidenceCollection();
      }
    }
    
    return result;
  }
  
  /**
   * 程序化判断（基于文档 4.5 节）
   * @private
   * @param {string} actionType - 功能类型
   * @param {Evidence} evidence - 收集到的证据
   * @returns {{pass: boolean, reason: string, needs_ai_assist?: boolean}}
   */
  #judgeProgrammatically(actionType, evidence) {
    const type = actionType.toLowerCase();
    
    switch (type) {
      case 'share':
      case '分享':
        return this.#judgeShare(evidence);
        
      case 'download':
      case '下载':
        return this.#judgeDownload(evidence);
        
      case 'link':
      case 'jump':
      case '跳转':
      case '链接':
        return this.#judgeLink(evidence);
        
      case 'submit':
      case '提交':
        return this.#judgeSubmit(evidence);
        
      case 'video':
      case '视频':
        return this.#judgeVideo(evidence);
        
      case 'reset':
      case '重置':
        return this.#judgeReset(evidence);
        
      case 'button':
      case '按钮':
        return this.#judgeButton(evidence);
        
      default:
        // 未知类型，需要 AI 辅助
        return {
          pass: false,
          reason: `未知功能类型: ${actionType}，需要 AI 辅助判断`,
          needs_ai_assist: true
        };
    }
  }
  
  // ==================== 程序化判断函数（文档 4.5 节） ====================
  
  /**
   * 分享功能判断
   * @private
   * @param {Evidence} evidence
   * @returns {{pass: boolean, reason: string, needs_ai_assist?: boolean}}
   */
  #judgeShare(evidence) {
    // 1. 检测弹窗（分享/复制确认）
    if (evidence.dialogAppeared) {
      if (/分享|share|复制|成功|链接|copy/i.test(evidence.dialogMessage)) {
        return { pass: true, reason: `弹出分享/复制确认弹窗: "${evidence.dialogMessage}"` };
      }
    }
    
    // 2. 检测控制台日志（剪贴板 API 调用）
    const shareConsoleLog = evidence.consoleMessages.find(m => 
      /share|clipboard|复制|分享/i.test(m)
    );
    if (shareConsoleLog) {
      return { pass: true, reason: `检测到分享/剪贴板 API 调用: "${shareConsoleLog}"` };
    }
    
    // 3. 检测网络请求（分享接口）
    const shareRequest = evidence.networkRequests.find(r =>
      /share|invite|link/i.test(r.url)
    );
    if (shareRequest) {
      return { pass: true, reason: `检测到分享相关请求: ${shareRequest.url}` };
    }
    
    // 4. 无法确定，需要 AI 辅助（可能是 Toast 提示）
    return {
      pass: false,
      reason: '点击后无明确分享响应，需要 AI 辅助检查是否有 Toast 提示',
      needs_ai_assist: true
    };
  }
  
  /**
   * 下载功能判断
   * @private
   * @param {Evidence} evidence
   * @returns {{pass: boolean, reason: string, needs_ai_assist?: boolean}}
   */
  #judgeDownload(evidence) {
    // 1. 检测 download 事件
    if (evidence.downloadTriggered) {
      return { pass: true, reason: '成功触发文件下载' };
    }
    
    // 2. 检测网络请求（下载相关 URL）
    const downloadRequest = evidence.networkRequests.find(r =>
      /download|blob:|\.pdf|\.xlsx|\.doc|\.zip|\.csv|\.png|\.jpg|export/i.test(r.url)
    );
    if (downloadRequest) {
      return { pass: true, reason: `检测到下载请求: ${downloadRequest.url.substring(0, 80)}...` };
    }
    
    // 3. 下载功能是纯程序化判断，无需 AI
    return {
      pass: false,
      reason: '点击后未触发下载（无 download 事件和下载请求）'
    };
  }
  
  /**
   * 跳转/链接功能判断
   * @private
   * @param {Evidence} evidence
   * @returns {{pass: boolean, reason: string, needs_ai_assist?: boolean}}
   */
  #judgeLink(evidence) {
    // 检测 URL 变化
    if (evidence.urlBefore !== evidence.urlAfter) {
      return { 
        pass: true, 
        reason: `URL 已跳转: ${evidence.urlBefore} → ${evidence.urlAfter}` 
      };
    }
    
    // 跳转功能是纯程序化判断，无需 AI
    return {
      pass: false,
      reason: 'URL 未变化，跳转未生效'
    };
  }
  
  /**
   * 表单提交功能判断
   * @private
   * @param {Evidence} evidence
   * @returns {{pass: boolean, reason: string, needs_ai_assist?: boolean}}
   */
  #judgeSubmit(evidence) {
    // 1. 检测 POST/PUT 请求
    const submitRequest = evidence.networkRequests.find(r =>
      r.method === 'POST' || r.method === 'PUT'
    );
    
    if (submitRequest) {
      return { 
        pass: true, 
        reason: `检测到 ${submitRequest.method} 请求: ${submitRequest.url.substring(0, 60)}...` 
      };
    }
    
    // 2. 检测弹窗反馈
    if (evidence.dialogAppeared) {
      if (/成功|success|提交|submitted/i.test(evidence.dialogMessage)) {
        return { pass: true, reason: `弹出提交成功提示: "${evidence.dialogMessage}"` };
      }
    }
    
    // 3. 可能需要 AI 确认 UI 反馈
    return {
      pass: false,
      reason: '未检测到表单提交请求',
      needs_ai_assist: true
    };
  }
  
  /**
   * 视频播放功能判断
   * @private
   * @param {Evidence} evidence
   * @returns {{pass: boolean, reason: string, needs_ai_assist?: boolean}}
   */
  #judgeVideo(evidence) {
    // 视频状态需要通过 page.evaluate 检测，这里只做基本判断
    // 具体视频状态检测在 executeL3Test 中通过额外逻辑处理
    
    // 检测视频相关请求
    const videoRequest = evidence.networkRequests.find(r =>
      /\.mp4|\.webm|\.m3u8|video|stream/i.test(r.url)
    );
    
    if (videoRequest) {
      return { pass: true, reason: `检测到视频流请求: ${videoRequest.url.substring(0, 60)}...` };
    }
    
    // 需要 AI 辅助或额外的 DOM 检测
    return {
      pass: false,
      reason: '需要检测视频播放状态',
      needs_ai_assist: true
    };
  }
  
  /**
   * 重置功能判断
   * @private
   * @param {Evidence} evidence
   * @returns {{pass: boolean, reason: string, needs_ai_assist?: boolean}}
   */
  #judgeReset(evidence) {
    // 重置功能需要对比表单值变化，需要额外的 DOM 检测
    // 这里做基本判断
    
    // 检测弹窗确认
    if (evidence.dialogAppeared) {
      if (/重置|reset|清空|clear|恢复/i.test(evidence.dialogMessage)) {
        return { pass: true, reason: `弹出重置确认: "${evidence.dialogMessage}"` };
      }
    }
    
    // 需要 AI 辅助确认表单是否重置
    return {
      pass: false,
      reason: '需要 AI 辅助确认表单是否已重置',
      needs_ai_assist: true
    };
  }
  
  /**
   * 通用按钮功能判断
   * @private
   * @param {Evidence} evidence
   * @returns {{pass: boolean, reason: string, needs_ai_assist?: boolean}}
   */
  #judgeButton(evidence) {
    // 1. 检测弹窗响应
    if (evidence.dialogAppeared) {
      return { pass: true, reason: `弹出提示: "${evidence.dialogMessage}"` };
    }
    
    // 2. 检测网络请求
    if (evidence.networkRequests.length > 0) {
      const lastReq = evidence.networkRequests[evidence.networkRequests.length - 1];
      return { pass: true, reason: `检测到网络请求: ${lastReq.method} ${lastReq.url.substring(0, 50)}...` };
    }
    
    // 3. 检测 URL 变化
    if (evidence.urlBefore !== evidence.urlAfter) {
      return { pass: true, reason: `页面跳转: ${evidence.urlAfter}` };
    }
    
    // 4. 无法确定，需要 AI 辅助
    return {
      pass: false,
      reason: '点击后无明确响应（无弹窗、网络请求、URL变化）',
      needs_ai_assist: true
    };
  }

  // ==================== 工具方法 ====================
  
  /**
   * 截图
   * @param {Object} [options] - 截图选项
   * @returns {Promise<Buffer>}
   */
  async screenshot(options = {}) {
    return await this.#page.screenshot(options);
  }
  
  /**
   * 获取页面 HTML 内容
   * @returns {Promise<string>}
   */
  async getContent() {
    return await this.#page.content();
  }
  
  /**
   * 获取当前 URL
   * @returns {string}
   */
  getCurrentUrl() {
    return this.#page.url();
  }
  
  /**
   * 获取 Playwright Page 对象（兼容现有代码）
   * @returns {import('playwright').Page}
   */
  getPage() {
    return this.#page;
  }
  
  /**
   * 等待指定时间
   * @param {number} ms - 毫秒数
   * @returns {Promise<void>}
   */
  async wait(ms) {
    await this.#page.waitForTimeout(ms);
  }
  
  /**
   * 检测视频播放状态（辅助方法）
   * @param {string} [selector='video'] - 视频元素选择器
   * @returns {Promise<{paused: boolean, currentTime: number}|null>}
   */
  async getVideoState(selector = 'video') {
    try {
      return await this.#page.evaluate((sel) => {
        const video = document.querySelector(sel);
        if (!video) return null;
        return {
          paused: video.paused,
          currentTime: video.currentTime,
          duration: video.duration
        };
      }, selector);
    } catch (e) {
      return null;
    }
  }
  
  /**
   * 获取表单字段值（辅助方法）
   * @param {string} formSelector - 表单选择器
   * @returns {Promise<Object>}
   */
  async getFormValues(formSelector) {
    try {
      return await this.#page.evaluate((sel) => {
        const form = document.querySelector(sel);
        if (!form) return {};
        
        const values = {};
        const inputs = form.querySelectorAll('input, textarea, select');
        inputs.forEach((input, index) => {
          const key = input.name || input.id || `field_${index}`;
          values[key] = input.value;
        });
        return values;
      }, formSelector);
    } catch (e) {
      return {};
    }
  }

  // ==================== L4 布局质量检测（文档 4.7 节） ====================
  
  /**
   * 注入布局扫描器，执行 L4 布局质量检测
   * 纯前端几何计算，不依赖外部大模型
   * @returns {Promise<Array<{type: string, tag: string, className: string, reason: string, location: string}>>}
   */
  async injectLayoutScanner() {
    console.log('[L4] 注入布局扫描器...');
    
    const issues = await this.#page.evaluate(() => {
      const results = [];
      
      // ========== 工具函数 ==========
      const getElementInfo = (el) => ({
        tag: el.tagName.toLowerCase(),
        className: el.className ? String(el.className).split(' ').filter(c => c).slice(0, 2).join('.') : '',
        id: el.id || ''
      });
      
      const getLocation = (rect) => {
        const vw = window.innerWidth, vh = window.innerHeight;
        let pos = [];
        if (rect.top < vh * 0.3) pos.push('顶部');
        else if (rect.top > vh * 0.7) pos.push('底部');
        else pos.push('中部');
        if (rect.left < vw * 0.3) pos.push('左侧');
        else if (rect.left > vw * 0.7) pos.push('右侧');
        return pos.join('') || '中央';
      };
      
      // ========== 1. 截断检测 (checkTextTruncation) ==========
      const textSelectors = 'p, span, h1, h2, h3, h4, h5, h6, div, li, a, label, td, th';
      document.querySelectorAll(textSelectors).forEach(el => {
        if (!el.textContent?.trim() || el.offsetHeight === 0 || el.offsetWidth === 0) return;
        if (el.querySelector('p, div, h1, h2, h3, h4, h5, h6')) return;
        
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const hasOverflowHidden = style.overflow === 'hidden' || style.overflowX === 'hidden' || style.overflowY === 'hidden';
        const hasEllipsis = style.textOverflow === 'ellipsis';
        const hasLineClamp = style.webkitLineClamp && style.webkitLineClamp !== 'none';
        
        // 垂直截断
        if ((hasOverflowHidden || hasLineClamp) && el.scrollHeight > el.clientHeight + 2) {
          const info = getElementInfo(el);
          results.push({
            type: 'text_truncated_vertical', tag: info.tag, className: info.className, id: info.id,
            text: el.textContent.substring(0, 40).trim() + '...',
            reason: `文字垂直截断 (scrollH:${el.scrollHeight} > clientH:${el.clientHeight})`,
            location: getLocation(rect), severity: 'medium'
          });
        }
        // 水平截断
        if ((hasOverflowHidden || hasEllipsis) && el.scrollWidth > el.clientWidth + 2) {
          const info = getElementInfo(el);
          results.push({
            type: 'text_truncated_horizontal', tag: info.tag, className: info.className, id: info.id,
            text: el.textContent.substring(0, 40).trim() + '...',
            reason: `文字水平截断 (scrollW:${el.scrollWidth} > clientW:${el.clientWidth})`,
            location: getLocation(rect), severity: 'medium'
          });
        }
      });
      
      // ========== 2. 遮挡检测 (checkElementOverlap) - 多点采样 ==========
      const importantSelectors = 'h1, h2, h3, h4, h5, h6, p, span, a, button, label';
      document.querySelectorAll(importantSelectors).forEach(el => {
        if (!el.textContent?.trim() || el.offsetHeight === 0) return;
        
        const rect = el.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) return;
        if (rect.right < 0 || rect.left > window.innerWidth) return;
        if (rect.width < 10 || rect.height < 10) return; // 跳过太小的元素
        
        // 多点采样：左中、中心、右中、5个点
        const samplePoints = [
          { x: rect.left + rect.width * 0.2, y: rect.top + rect.height / 2 },  // 左侧
          { x: rect.left + rect.width * 0.5, y: rect.top + rect.height / 2 },  // 中心
          { x: rect.left + rect.width * 0.8, y: rect.top + rect.height / 2 },  // 右侧
          { x: rect.left + rect.width * 0.2, y: rect.top + rect.height * 0.3 }, // 左上
          { x: rect.left + rect.width * 0.8, y: rect.top + rect.height * 0.7 }, // 右下
        ];
        
        let coveredCount = 0;
        let coverElement = null;
        
        for (const pt of samplePoints) {
          if (pt.x < 0 || pt.x > window.innerWidth || pt.y < 0 || pt.y > window.innerHeight) continue;
          
          const topElement = document.elementFromPoint(pt.x, pt.y);
          if (!topElement) continue;
          
          const isSelf = topElement === el;
          const isDescendant = el.contains(topElement);
          const isAncestor = topElement.contains(el);
          
          if (!isSelf && !isDescendant && !isAncestor) {
            const topStyle = getComputedStyle(topElement);
            const hasVisualContent = 
              topElement.tagName === 'IMG' || topElement.tagName === 'VIDEO' ||
              topElement.tagName === 'CANVAS' || topElement.tagName === 'SVG' ||
              (topStyle.backgroundColor && topStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' && topStyle.backgroundColor !== 'transparent') ||
              (topStyle.backgroundImage && topStyle.backgroundImage !== 'none');
            const hasPosition = topStyle.position === 'fixed' || topStyle.position === 'absolute';
            const hasMediaChild = topElement.tagName === 'DIV' && topElement.querySelector('img, video, canvas');
            
            if (hasVisualContent || hasPosition || hasMediaChild) {
              coveredCount++;
              if (!coverElement) coverElement = topElement;
            }
          }
        }
        
        // 超过 1 个采样点被遮挡则判定为遮挡
        if (coveredCount >= 1 && coverElement) {
          const info = getElementInfo(el);
          const coverInfo = getElementInfo(coverElement);
          results.push({
            type: 'element_covered', tag: info.tag, className: info.className, id: info.id,
            text: el.textContent.substring(0, 30).trim(),
            reason: `被 <${coverInfo.tag}${coverInfo.className ? '.' + coverInfo.className : ''}> 遮挡 (${coveredCount}/5 采样点)`,
            coveredBy: { tag: coverInfo.tag, className: coverInfo.className },
            location: getLocation(rect), severity: 'high'
          });
        }
      });
      
      // ========== 3. 溢出检测 ==========
      const vw = window.innerWidth;
      document.querySelectorAll('div, section, article, main').forEach(el => {
        if (el.offsetHeight === 0) return;
        const rect = el.getBoundingClientRect();
        if (rect.right > vw + 20 && rect.width < vw * 2) {
          const info = getElementInfo(el);
          results.push({
            type: 'overflow_right', tag: info.tag, className: info.className, id: info.id,
            reason: `元素超出视口右侧 ${Math.round(rect.right - vw)}px`,
            location: getLocation(rect), severity: 'low'
          });
        }
      });
      
      // 去重
      const seen = new Set();
      return results.filter(item => {
        const key = `${item.type}|${item.tag}|${item.className}|${item.location}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
    
    console.log(`[L4] 布局扫描完成，发现 ${issues.length} 个问题`);
    return issues;
  }
  
  /**
   * 执行完整的 L4 布局质量检测
   * @returns {Promise<{pass: boolean, issues: Array, summary: string}>}
   */
  async executeL4Test() {
    console.log('[L4] 开始 L4 布局质量检测...');
    const issues = await this.injectLayoutScanner();
    
    const highCount = issues.filter(i => i.severity === 'high').length;
    const mediumCount = issues.filter(i => i.severity === 'medium').length;
    const lowCount = issues.filter(i => i.severity === 'low').length;
    
    const pass = highCount === 0 && mediumCount === 0;
    const summary = pass 
      ? '页面布局正常，未发现显著问题'
      : `发现 ${highCount} 个严重问题, ${mediumCount} 个中等问题, ${lowCount} 个轻微问题`;
    
    console.log(`[L4] 结果: ${pass ? '✅ 通过' : '❌ 不通过'} - ${summary}`);
    return { pass, issues, summary };
  }
}

export default PlaywrightRunner;
