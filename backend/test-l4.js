/**
 * L4 布局质量检测测试脚本
 * 测试 PlaywrightRunner 的 injectLayoutScanner 算法
 */

import PlaywrightRunner from './services/PlaywrightRunner.js';

// 测试用 HTML - 包含各种布局问题
const testHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>L4 布局检测测试页</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
    
    /* 测试1: 文字被图片遮挡 */
    .overlap-test {
      position: relative;
      height: 200px;
      margin-bottom: 40px;
      background: #f0f0f0;
      padding: 20px;
    }
    .overlap-test h2 {
      position: relative;
      z-index: 1;
      color: #333;
    }
    .overlap-test .cover-image {
      position: absolute;
      top: 10px;
      left: 10px;
      width: 300px;
      height: 100px;
      background: #3498db;
      z-index: 10;
    }
    
    /* 测试2: 文字垂直截断 */
    .truncate-vertical {
      height: 40px;
      overflow: hidden;
      background: #e8f4f8;
      padding: 10px;
      margin-bottom: 20px;
    }
    
    /* 测试3: 文字水平截断 (ellipsis) */
    .truncate-horizontal {
      width: 200px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      background: #f8e8e8;
      padding: 10px;
      margin-bottom: 20px;
    }
    
    /* 测试4: 元素超出视口 */
    .overflow-container {
      width: 2000px;
      background: #e8e8f8;
      padding: 20px;
      margin-bottom: 20px;
    }
    
    /* 测试5: 正常元素（不应被检测） */
    .normal-section {
      background: #e8f8e8;
      padding: 20px;
      margin-bottom: 20px;
    }
    
    /* 测试6: -webkit-line-clamp 截断 */
    .line-clamp-test {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      background: #f8f8e8;
      padding: 10px;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <h1>L4 布局质量检测测试</h1>
  
  <!-- 测试1: 遮挡检测 -->
  <section class="overlap-test">
    <h2>这段标题文字应该被检测为被遮挡</h2>
    <p>这段正文也被蓝色块遮挡了</p>
    <div class="cover-image"></div>
  </section>
  
  <!-- 测试2: 垂直截断 -->
  <section class="truncate-vertical">
    <p>这是一段很长的文字，由于容器高度限制，会被垂直截断。
    这里还有更多内容，但是因为 overflow: hidden 和固定高度，
    用户无法看到完整的文字内容，这是一个布局问题。</p>
  </section>
  
  <!-- 测试3: 水平截断 -->
  <section>
    <div class="truncate-horizontal">
      这是一段很长的单行文字，会被水平截断并显示省略号...更多内容
    </div>
  </section>
  
  <!-- 测试4: 视口溢出 -->
  <section class="overflow-container">
    <p>这个容器宽度超出了视口</p>
  </section>
  
  <!-- 测试5: 正常内容 -->
  <section class="normal-section">
    <h3>正常标题</h3>
    <p>这是正常显示的段落，不应该被检测为有问题。</p>
  </section>
  
  <!-- 测试6: line-clamp 截断 -->
  <section class="line-clamp-test">
    <p>这段文字使用了 -webkit-line-clamp: 2 属性，
    只会显示两行，超出的内容会被截断。
    这里是第三行内容，应该被隐藏。
    第四行也不会显示。</p>
  </section>
  
</body>
</html>
`;

async function runTest() {
  console.log('='.repeat(60));
  console.log('🧪 L4 布局质量检测测试');
  console.log('='.repeat(60));
  
  const runner = new PlaywrightRunner();
  
  try {
    // 启动浏览器
    await runner.launch({ headless: true });
    console.log('\n✅ 浏览器已启动');
    
    // 加载测试页面
    await runner.setContent(testHTML);
    console.log('✅ 测试页面已加载\n');
    
    // 执行 L4 检测
    console.log('-'.repeat(60));
    const result = await runner.executeL4Test();
    console.log('-'.repeat(60));
    
    // 输出详细结果
    console.log('\n📊 检测结果详情:\n');
    
    if (result.issues.length === 0) {
      console.log('  （未检测到布局问题）');
    } else {
      result.issues.forEach((issue, index) => {
        const severityIcon = issue.severity === 'high' ? '🔴' : 
                            issue.severity === 'medium' ? '🟡' : '🟢';
        console.log(`  ${index + 1}. ${severityIcon} [${issue.type}]`);
        console.log(`     元素: <${issue.tag}${issue.className ? '.' + issue.className : ''}>`);
        console.log(`     位置: ${issue.location}`);
        console.log(`     原因: ${issue.reason}`);
        if (issue.text) {
          console.log(`     内容: "${issue.text}"`);
        }
        if (issue.coveredBy) {
          console.log(`     遮挡者: <${issue.coveredBy.tag}.${issue.coveredBy.className}>`);
        }
        console.log('');
      });
    }
    
    // 输出汇总
    console.log('='.repeat(60));
    console.log(`📋 汇总: ${result.summary}`);
    console.log(`🏁 最终结果: ${result.pass ? '✅ 通过' : '❌ 不通过'}`);
    console.log('='.repeat(60));
    
    // 截图保存
    const screenshot = await runner.screenshot({ fullPage: true });
    const fs = await import('fs');
    fs.writeFileSync('./screenshots/l4-test.png', screenshot);
    console.log('\n📸 测试页面截图已保存: ./screenshots/l4-test.png');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  } finally {
    await runner.close();
    console.log('\n✅ 测试完成，浏览器已关闭');
  }
}

// 执行测试
runTest();
