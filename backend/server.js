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

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// URL 方式检测
app.post('/api/detect/url', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: '请提供 Case URL' });
    }
    
    console.log(`[检测] 开始检测 URL: ${url}`);
    const result = await detectFromUrl(url);
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
    
    console.log(`[检测] 开始检测 HTML 代码`);
    const result = await detectFromHtml(html);
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
    console.log(`[检测] 开始检测上传文件: ${req.file.originalname}`);
    const result = await detectFromHtml(html);
    res.json(result);
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
║  API:                                                      ║
║    POST /api/detect/url   - URL方式检测                    ║
║    POST /api/detect/html  - HTML代码检测                   ║
║    POST /api/detect/file  - 文件上传检测                   ║
╚════════════════════════════════════════════════════════════╝
  `);
});
