import { useState } from 'react'

function App() {
  const [activeTab, setActiveTab] = useState('url')
  const [url, setUrl] = useState('')
  const [html, setHtml] = useState('')
  const [files, setFiles] = useState([]) // 改为数组支持多文件
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('')
  const [report, setReport] = useState(null)
  const [reports, setReports] = useState([]) // 批量检测报告列表
  const [expandedFeatures, setExpandedFeatures] = useState({})
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 }) // 批量进度
  const [totalDuration, setTotalDuration] = useState(null) // 总耗时

  const handleDetect = async () => {
    setLoading(true)
    setProgress(0)
    setReport(null)
    setReports([])
    setExpandedFeatures({})
    setTotalDuration(null)
    setBatchProgress({ current: 0, total: 0 })

    const startTime = Date.now()

    try {
      // 批量 URL 检测
      if (activeTab === 'url') {
        const urls = url.split('\n').map(u => u.trim()).filter(u => u.length > 0)
        
        if (urls.length === 0) {
          throw new Error('请输入至少一个 URL')
        }

        setBatchProgress({ current: 0, total: urls.length })
        const batchReports = []

        for (let i = 0; i < urls.length; i++) {
          const currentUrl = urls[i]
          setBatchProgress({ current: i + 1, total: urls.length })
          setProgress(Math.round(((i + 0.5) / urls.length) * 100))
          setProgressText(`正在检测 (${i + 1}/${urls.length}): ${currentUrl.substring(0, 50)}...`)

          const response = await fetch('/api/detect/url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: currentUrl })
          })

          if (!response.ok) {
            const error = await response.json()
            batchReports.push({
              source: currentUrl,
              error: error.error || '检测失败',
              timestamp: new Date().toISOString(),
              features: [],
              summary: { total: 0, passed: 0, failed: 0, passRate: 0 }
            })
          } else {
            const result = await response.json()
            batchReports.push(result)
          }

          setReports([...batchReports])
          setProgress(Math.round(((i + 1) / urls.length) * 100))
        }

        // 如果只有一个 URL，设置单个报告
        if (batchReports.length === 1) {
          setReport(batchReports[0])
        }

      } else if (activeTab === 'html') {
        setProgress(10)
        setProgressText('正在初始化检测引擎...')
        
        const response = await fetch('/api/detect/html', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ html })
        })

        setProgress(50)
        setProgressText('正在分析功能点...')

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || '检测失败')
        }

        setProgress(90)
        setProgressText('正在生成详细报告...')

        const result = await response.json()
        setReport(result)
        setReports([result])

      } else if (activeTab === 'file' && files.length > 0) {
        setBatchProgress({ current: 0, total: files.length })
        const batchReports = []

        for (let i = 0; i < files.length; i++) {
          const currentFile = files[i]
          setBatchProgress({ current: i + 1, total: files.length })
          setProgress(Math.round(((i + 0.5) / files.length) * 100))
          setProgressText(`正在检测 (${i + 1}/${files.length}): ${currentFile.name}`)

          const formData = new FormData()
          formData.append('file', currentFile)
          
          const response = await fetch('/api/detect/file', {
            method: 'POST',
            body: formData
          })

          if (!response.ok) {
            const error = await response.json()
            batchReports.push({
              source: currentFile.name,
              error: error.error || '检测失败',
              timestamp: new Date().toISOString(),
              features: [],
              summary: { total: 0, passed: 0, failed: 0, passRate: 0 }
            })
          } else {
            const result = await response.json()
            result.source = currentFile.name // 用文件名作为来源
            batchReports.push(result)
          }

          setReports([...batchReports])
          setProgress(Math.round(((i + 1) / files.length) * 100))
        }

        // 如果只有一个文件，设置单个报告
        if (batchReports.length === 1) {
          setReport(batchReports[0])
        }
      }

      setProgress(100)
      setProgressText('检测完成！')

    } catch (error) {
      alert('检测失败: ' + error.message)
    } finally {
      const endTime = Date.now()
      setTotalDuration(((endTime - startTime) / 1000).toFixed(1))
      setLoading(false)
    }
  }

  const toggleFeature = (id) => {
    setExpandedFeatures(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  const canDetect = () => {
    if (loading) return false
    if (activeTab === 'url') return url.trim().length > 0
    if (activeTab === 'html') return html.trim().length > 0
    if (activeTab === 'file') return files.length > 0
    return false
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <h1>Case 质量检测工具</h1>
      </header>

      {/* Input Card */}
      <div className="glass-card">
        <div className="card-header">
          <div className="card-icon">I</div>
          <span className="card-title">输入来源</span>
        </div>
        
        {/* Tabs */}
        <div className="tabs-container">
          <button 
            className={`tab ${activeTab === 'url' ? 'active' : ''}`}
            onClick={() => setActiveTab('url')}
          >
            URL 地址
          </button>
          <button 
            className={`tab ${activeTab === 'html' ? 'active' : ''}`}
            onClick={() => setActiveTab('html')}
          >
            HTML 源码
          </button>
          <button 
            className={`tab ${activeTab === 'file' ? 'active' : ''}`}
            onClick={() => setActiveTab('file')}
          >
            文件上传
          </button>
        </div>

        {/* Inputs */}
        <div className="input-wrapper">
          {activeTab === 'url' && (
            <textarea
              className="styled-textarea"
              placeholder="请输入需要检测的页面 URL，支持批量检测（每行一个 URL）&#10;&#10;例如:&#10;http://localhost:8080/page1&#10;http://localhost:8080/page2"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              rows={5}
            />
          )}

          {activeTab === 'html' && (
            <textarea
              className="styled-textarea"
              placeholder="请在此粘贴 HTML 源代码..."
              value={html}
              onChange={(e) => setHtml(e.target.value)}
            />
          )}

          {activeTab === 'file' && (
            <div className="file-upload-area" onClick={() => document.getElementById('file-input').click()}>
              <input
                id="file-input"
                type="file"
                accept=".html,.htm"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files))}
                style={{ display: 'none' }}
              />
              <div style={{ fontSize: '2rem', marginBottom: '1rem', color: 'var(--navy)' }}>§</div>
              <div>
                {files.length === 0 && '点击选择 HTML 文件（支持多选）'}
                {files.length === 1 && files[0].name}
                {files.length > 1 && `已选择 ${files.length} 个文件`}
              </div>
              <span className="file-label">支持格式：.html, .htm | 可批量选择多个文件</span>
              {files.length > 1 && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {files.map(f => f.name).join(', ')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Button */}
        <button 
          className="action-btn"
          onClick={handleDetect}
          disabled={!canDetect()}
        >
          <div className="btn-content">
            {loading ? '正在处理...' : '开始检测'}
          </div>
        </button>

        {/* Progress */}
        {loading && (
          <div className="progress-container">
            <div className="progress-bar-bg">
              <div 
                className="progress-bar-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="status-text">
              {progressText}
              {batchProgress.total > 1 && (
                <span style={{ marginLeft: '1rem', opacity: 0.7 }}>
                  ({batchProgress.current}/{batchProgress.total})
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 总耗时显示 */}
      {totalDuration && !loading && (
        <div style={{ textAlign: 'center', margin: '1rem 0', color: 'var(--text-muted)' }}>
          检测总耗时: <strong style={{ color: 'var(--navy)' }}>{totalDuration}s</strong>
          {reports.length > 1 && (
            <span style={{ marginLeft: '1rem' }}>
              | 共检测 <strong>{reports.length}</strong> 个页面
            </span>
          )}
        </div>
      )}

      {/* 批量检测报告 */}
      {reports.length > 1 && (
        <div className="glass-card">
          <div className="card-header">
            <div className="card-icon">II</div>
            <span className="card-title">批量检测汇总</span>
          </div>
          
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', padding: '1rem 0' }}>
              <div>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--navy)' }}>{reports.length}</div>
                <div style={{ color: 'var(--text-muted)' }}>总页面数</div>
              </div>
              <div>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--navy)' }}>
                  {reports.filter(r => !r.error && (r.summary?.passRate ?? 0) >= 60).length}
                </div>
                <div style={{ color: 'var(--text-muted)' }}>合格</div>
              </div>
              <div>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--red-pop)' }}>
                  {reports.filter(r => r.error || (r.summary?.passRate ?? 0) < 60).length}
                </div>
                <div style={{ color: 'var(--text-muted)' }}>不合格</div>
              </div>
              <div>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--navy)' }}>
                  {Math.round(reports.reduce((sum, r) => sum + (r.summary?.passRate ?? 0), 0) / reports.length)}%
                </div>
                <div style={{ color: 'var(--text-muted)' }}>平均通过率</div>
              </div>
            </div>
          </div>

          {/* 单个报告列表 */}
          {reports.map((rpt, rptIndex) => (
            <div key={rptIndex} style={{ 
              border: '1px solid var(--border-color)', 
              borderRadius: '8px', 
              marginBottom: '1rem',
              overflow: 'hidden'
            }}>
              <div 
                style={{ 
                  padding: '1rem', 
                  background: rpt.error ? 'rgba(220, 53, 69, 0.1)' : 'rgba(26, 55, 77, 0.05)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
                onClick={() => setExpandedFeatures(prev => ({ ...prev, [`rpt_${rptIndex}`]: !prev[`rpt_${rptIndex}`] }))}
              >
                <div>
                  <span style={{ 
                    color: rpt.error ? 'var(--red-pop)' : 'var(--navy)', 
                    fontWeight: 'bold',
                    marginRight: '0.5rem'
                  }}>
                    {rpt.error ? '✕' : '✓'}
                  </span>
                  <span style={{ fontSize: '0.9rem' }}>{rpt.source?.substring(0, 60) || 'HTML代码'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {rpt.duration && (
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      耗时: {rpt.duration}
                    </span>
                  )}
                  <span style={{ 
                    padding: '0.25rem 0.75rem', 
                    borderRadius: '20px',
                    fontSize: '0.85rem',
                    background: (rpt.summary?.passRate ?? 0) >= 60 ? 'var(--navy)' : 'var(--red-pop)',
                    color: 'white'
                  }}>
                    {rpt.summary?.passRate ?? 0}%
                  </span>
                  <span style={{ opacity: 0.5 }}>▼</span>
                </div>
              </div>
              
              {expandedFeatures[`rpt_${rptIndex}`] && (
                <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)' }}>
                  {rpt.error ? (
                    <div style={{ color: 'var(--red-pop)' }}>错误: {rpt.error}</div>
                  ) : (
                    <>
                      <div style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        共 {rpt.summary?.total ?? 0} 项检测 | 通过 {rpt.summary?.passed ?? 0} 项 | 失败 {rpt.summary?.failed ?? 0} 项
                      </div>
                      {rpt.features?.map((feature, fIdx) => (
                        <div key={fIdx} style={{ 
                          padding: '0.5rem', 
                          borderBottom: '1px solid var(--border-color)',
                          display: 'flex',
                          justifyContent: 'space-between'
                        }}>
                          <span>
                            <span style={{ color: (feature.finalResult ?? feature.status) === 'pass' ? 'var(--navy)' : 'var(--red-pop)' }}>
                              {(feature.finalResult ?? feature.status) === 'pass' ? '✓' : '✕'}
                            </span>
                            {' '}{feature.name}
                          </span>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            {feature.type}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Report Card */}
      {report && reports.length <= 1 && (
        <div className="glass-card report-section">
          <div className="card-header">
            <div className="card-icon">II</div>
            <span className="card-title">检测报告</span>
          </div>

          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div className={`score-badge ${(report.score ?? report.summary?.passRate ?? 0) >= 80 ? 'pass' : 'fail'}`}>
              <span className="score-value">{report.score ?? report.summary?.passRate ?? 0}</span>
              <span className="score-label">得分</span>
            </div>
            <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-serif-body)', fontStyle: 'italic' }}>
              生成时间：{new Date(report.timestamp).toLocaleString()}
            </div>
            {report.duration && (
              <div style={{ marginTop: '0.5rem', color: 'var(--navy)', fontWeight: 'bold' }}>
                检测耗时：{report.duration}
              </div>
            )}
            {report.summary && (
              <div style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>
                共 {report.summary.total} 项检测 | 通过 {report.summary.passed} 项 | 失败 {report.summary.failed} 项
              </div>
            )}
          </div>

          <div className="feature-list">
            {report.features.map((feature, index) => (
              <div 
                key={index} 
                className={`feature-item ${expandedFeatures[index] ? 'expanded' : ''}`}
              >
                <div 
                  className="feature-header"
                  onClick={() => toggleFeature(index)}
                >
                  <div className="feature-info">
                    <span className="status-icon" style={{ color: (feature.status ?? feature.finalResult) === 'pass' ? 'var(--navy)' : 'var(--red-pop)' }}>
                      {(feature.status ?? feature.finalResult) === 'pass' ? '✓' : '✕'}
                    </span>
                    <span className="feature-name">{feature.name}</span>
                  </div>
                  <div className="expand-icon">▼</div>
                </div>

                {expandedFeatures[index] && (
                  <div className="feature-details">
                    <div className="detail-row">
                      <span className="detail-label">预期行为:</span>
                      <span>{feature.description ?? feature.expectedBehavior}</span>
                    </div>
                    
                    {/* L1 检测结果 */}
                    {feature.l1 && (
                      <div className="detail-row">
                        <span className="detail-label">L1 存在性:</span>
                        <span style={{ color: feature.l1.pass ? 'var(--navy)' : 'var(--red-pop)' }}>
                          {feature.l1.pass ? '✓ ' : '✕ '}{feature.l1.message}
                        </span>
                      </div>
                    )}
                    
                    {/* L2 检测结果 */}
                    {feature.l2 && (
                      <div className="detail-row">
                        <span className="detail-label">L2 可交互:</span>
                        <span style={{ color: feature.l2.pass ? 'var(--navy)' : 'var(--red-pop)' }}>
                          {feature.l2.pass ? '✓ ' : '✕ '}{feature.l2.message}
                        </span>
                      </div>
                    )}
                    
                    {/* L3 检测结果 */}
                    {feature.l3 && (
                      <div className="detail-row">
                        <span className="detail-label">L3 功能性:</span>
                        <span style={{ color: feature.l3.pass ? 'var(--navy)' : 'var(--red-pop)' }}>
                          {feature.l3.pass ? '✓ ' : '✕ '}{feature.l3.message}
                        </span>
                      </div>
                    )}
                    
                    {(feature.error || (!feature.l3?.pass && feature.l3?.message)) && (
                      <div className="detail-row" style={{ color: 'var(--red-pop)' }}>
                        <span className="detail-label">问题说明:</span>
                        <span>{feature.error || feature.l3?.message}</span>
                      </div>
                    )}
                    
                    {feature.suggestion && (
                      <div className="detail-row" style={{ color: 'var(--navy)' }}>
                        <span className="detail-label">修复建议:</span>
                        <span>{feature.suggestion}</span>
                      </div>
                    )}

                    {feature.selector && (
                      <div style={{ marginTop: '1rem' }}>
                        <span className="detail-label">目标选择器:</span>
                        <div className="code-block">{feature.selector}</div>
                      </div>
                    )}

                    {feature.screenshot && (
                      <div className="screenshot-preview">
                        <img src={feature.screenshot} alt="截图证据" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
