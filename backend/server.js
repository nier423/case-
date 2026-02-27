import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

import { detectFromUrl, detectFromHtml } from './services/detectorService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// ===== 并发控制配置 =====
const MAX_CONCURRENT_TASKS = parseInt(process.env.MAX_CONCURRENT_TASKS) || 3;
const taskQueue = [];
let runningTasks = 0;
let taskIdCounter = 0;

// 确保截图目录存在
const screenshotsDir = join(__dirname, 'screenshots');
if (!existsSync(screenshotsDir)) {
  mkdirSync(screenshotsDir, { recursive: true });
}

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/screenshots', express.static(screenshotsDir));

// 文件上传配置
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ===== 任务队列管理 =====

/**
 * 执行队列中的下一个任务
 */
async function processNextTask() {
  if (taskQueue.length === 0 || runningTasks >= MAX_CONCURRENT_TASKS) {
    return;
  }
  
  const task = taskQueue.shift();
  runningTasks++;
  
  console.log(`[队列] 开始任务 ${task.id}, 当前运行: ${runningTasks}/${MAX_CONCURRENT_TASKS}, 等待: ${taskQueue.length}`);
  
  try {
    const startTime = Date.now();
    let result;
    
    if (task.type === 'url') {
      result = await detectFromUrl(task.data);
    } else {
      result = await detectFromHtml(task.data);
    }
    
    result.taskId = task.id;
    result.queueTime = task.queueTime;
    result.totalTime = ((Date.now() - task.createdAt) / 1000).toFixed(1) + 's';
    
    task.resolve(result);
    console.log(`[队列] 任务 ${task.id} 完成, 耗时: ${result.totalTime}`);
  } catch (error) {
    task.reject(error);
    console.error(`[队列] 任务 ${task.id} 失败:`, error.message);
  } finally {
    runningTasks--;
    setImmediate(processNextTask);
  }
}

/**
 * 将任务加入队列
 */
function enqueueTask(type, data) {
  return new Promise((resolve, reject) => {
    const taskId = ++taskIdCounter;
    const task = {
      id: taskId,
      type,
      data,
      resolve,
      reject,
      createdAt: Date.now(),
      queueTime: null
    };
    
    if (runningTasks < MAX_CONCURRENT_TASKS) {
      task.queueTime = '0s';
      taskQueue.push(task);
      processNextTask();
    } else {
      task.queueTime = `排队中 (前面 ${taskQueue.length} 个任务)`;
      taskQueue.push(task);
      console.log(`[队列] 任务 ${taskId} 加入队列, 位置: ${taskQueue.length}`);
    }
  });
}

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    queue: {
      running: runningTasks,
      waiting: taskQueue.length,
      maxConcurrent: MAX_CONCURRENT_TASKS
    }
  });
});

// 获取队列状态
app.get('/api/queue/status', (req, res) => {
  res.json({
    running: runningTasks,
    waiting: taskQueue.length,
    maxConcurrent: MAX_CONCURRENT_TASKS,
    waitingTasks: taskQueue.map(t => ({ id: t.id, type: t.type, waitingSince: Date.now() - t.createdAt }))
  });
});

// URL 方式检测
app.post('/api/detect/url', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: '请提供 Case URL' });
    }
    
    console.log(`[API] 收到 URL 检测请求: ${url}`);
    const result = await enqueueTask('url', url);
    res.json(result);
  } catch (error) {
    console.error('[错误]', error);
    res.status(500).json({ error: error.message });
  }
});

// HTML 代码方式检测
app.post('/api/detect/html', async (req, res) => {
  try {
    const { html } = req.body;
    if (!html) {
      return res.status(400).json({ error: '请提供 HTML 代码' });
    }
    
    console.log(`[API] 收到 HTML 检测请求, 长度: ${html.length}`);
    const result = await enqueueTask('html', html);
    res.json(result);
  } catch (error) {
    console.error('[错误]', error);
    res.status(500).json({ error: error.message });
  }
});

// 文件上传方式检测
app.post('/api/detect/file', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传文件' });
    }
    
    const html = req.file.buffer.toString('utf-8');
    console.log(`[API] 收到文件检测请求: ${req.file.originalname}`);
    const result = await enqueueTask('html', html);
    res.json(result);
  } catch (error) {
    console.error('[错误]', error);
    res.status(500).json({ error: error.message });
  }
});

// 批量检测接口
app.post('/api/detect/batch', async (req, res) => {
  try {
    const { items } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: '请提供检测项目数组' });
    }
    
    if (items.length > 20) {
      return res.status(400).json({ error: '单次批量检测最多支持 20 个项目' });
    }
    
    console.log(`[API] 收到批量检测请求: ${items.length} 个项目`);
    
    const taskPromises = items.map(item => enqueueTask(item.type, item.data));
    const results = await Promise.allSettled(taskPromises);
    
    res.json({
      total: items.length,
      completed: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
      results: results.map((r, i) => ({
        index: i,
        status: r.status,
        result: r.status === 'fulfilled' ? r.value : null,
        error: r.status === 'rejected' ? r.reason.message : null
      }))
    });
  } catch (error) {
    console.error('[错误]', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║           Case 质量检测服务已启动                           ║
╠════════════════════════════════════════════════════════════╣
║  地址: http://localhost:${PORT}                              ║
║  并发: 最大 ${MAX_CONCURRENT_TASKS} 个任务同时执行                          ║
║  API:                                                      ║
║    POST /api/detect/url    - URL方式检测                   ║
║    POST /api/detect/html   - HTML代码检测                  ║
║    POST /api/detect/file   - 文件上传检测                  ║
║    POST /api/detect/batch  - 批量检测                      ║
║    GET  /api/queue/status  - 查看队列状态                  ║
╚════════════════════════════════════════════════════════════╝
  `);
});
