import { useState, useEffect } from "react"

interface DOMInfo {
  domSize: number
  elementCount: number
  url: string
  title: string
  error?: string
}

function IndexPopup() {
  const [domInfo, setDomInfo] = useState<DOMInfo | null>(null)
  const [loading, setLoading] = useState(true)

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getDOMInfo = async () => {
    try {
      setLoading(true)
      
      // 現在のアクティブタブを取得
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      
      if (!tab.id) {
        setDomInfo({
          domSize: 0,
          elementCount: 0,
          url: 'Unknown',
          title: 'Unknown',
          error: 'Unable to get active tab'
        })
        return
      }

      // 特別なページ（chrome://、chrome-extension://など）をチェック
      if (tab.url?.startsWith('chrome://') || 
          tab.url?.startsWith('chrome-extension://') || 
          tab.url?.startsWith('edge://') || 
          tab.url?.startsWith('about:') ||
          tab.url?.startsWith('moz-extension://')) {
        setDomInfo({
          domSize: 0,
          elementCount: 0,
          url: tab.url,
          title: tab.title || 'Unknown',
          error: 'Content scripts cannot run on browser internal pages (chrome://, about:, etc.)'
        })
        return
      }

      try {
        const [execution] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            try {
              const rootHtml = document.documentElement?.outerHTML ?? ""
              return {
                domSize: new Blob([rootHtml]).size,
                elementCount: document.getElementsByTagName("*").length,
                url: window.location.href,
                title: document.title
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error)
              return {
                domSize: 0,
                elementCount: 0,
                url: window.location.href,
                title: document.title,
                error: `Error while reading DOM: ${message}`
              }
            }
          }
        })

        if (!execution?.result) {
          setDomInfo({
            domSize: 0,
            elementCount: 0,
            url: tab.url || 'Unknown',
            title: tab.title || 'Unknown',
            error: "Failed to execute script on the current tab."
          })
          return
        }

        setDomInfo(execution.result as DOMInfo)
      } catch (scriptError) {
        const message = scriptError instanceof Error ? scriptError.message : String(scriptError)
        setDomInfo({
          domSize: 0,
          elementCount: 0,
          url: tab.url || 'Unknown',
          title: tab.title || 'Unknown',
          error: `Could not inspect the current page. ${message}`
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setDomInfo({
        domSize: 0,
        elementCount: 0,
        url: 'Unknown',
        title: 'Unknown',
        error: `Error: ${message}`
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    getDOMInfo()
  }, [])

  if (loading) {
    return (
      <div style={{ padding: 16, width: 400, minHeight: 300 }}>
        <h3>🔧 Dev Kits</h3>
        <div style={{ textAlign: 'center', marginTop: 50 }}>
          <div>Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ 
      padding: 16, 
      width: 500, 
      minHeight: 400,
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        borderBottom: '2px solid #e1e5e9',
        paddingBottom: 12,
        marginBottom: 16
      }}>
        <h3 style={{ margin: 0, color: '#24292e' }}>🔧 Dev Kits</h3>
        <button 
          onClick={getDOMInfo}
          style={{
            padding: '6px 12px',
            backgroundColor: '#0366d6',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          Refresh
        </button>
      </div>

      {domInfo?.error ? (
        <div style={{ 
          color: '#d73a49',
          backgroundColor: '#ffeef0',
          padding: 16,
          borderRadius: 6,
          border: '1px solid #fdaeb7'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '18px', marginRight: 8 }}>⚠️</span>
            <strong>Connection Error</strong>
          </div>
          <div style={{ fontSize: '13px', lineHeight: '1.5', marginBottom: 12 }}>
            {domInfo.error}
          </div>
          <div style={{ 
            backgroundColor: '#fff5f5', 
            padding: 10, 
            borderRadius: 4,
            fontSize: '12px', 
            color: '#6a737d',
            borderLeft: '3px solid #fdaeb7'
          }}>
            <strong>Troubleshooting:</strong>
            <ul style={{ margin: '6px 0', paddingLeft: '16px' }}>
              <li>Refresh the current page and try again</li>
              <li>Make sure you're on a regular web page (not chrome://, about:, etc.)</li>
              <li>Check if the extension is enabled</li>
              <li>Try reloading the extension</li>
            </ul>
          </div>
          <button 
            onClick={getDOMInfo}
            style={{
              marginTop: 12,
              padding: '8px 16px',
              backgroundColor: '#0366d6',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: '12px',
              width: '100%'
            }}
          >
            🔄 Try Again
          </button>
        </div>
      ) : (
        <>
          {/* ページ情報 */}
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#24292e' }}>📄 Page Info</h4>
            <div style={{ 
              backgroundColor: '#f6f8fa', 
              padding: 12, 
              borderRadius: 6,
              fontSize: '13px'
            }}>
              <div><strong>Title:</strong> {domInfo?.title}</div>
              <div style={{ marginTop: 4, wordBreak: 'break-all' }}>
                <strong>URL:</strong> {domInfo?.url}
              </div>
            </div>
          </div>

          {/* DOM統計 */}
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#24292e' }}>📊 DOM Statistics</h4>
            <div style={{ 
              backgroundColor: '#f6f8fa', 
              padding: 12, 
              borderRadius: 6,
              fontSize: '13px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span><strong>DOM Size:</strong></span>
                <span style={{ color: '#0366d6', fontWeight: 'bold' }}>
                  {formatBytes(domInfo?.domSize || 0)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span><strong>Elements:</strong></span>
                <span style={{ color: '#28a745', fontWeight: 'bold' }}>
                  {domInfo?.elementCount || 0}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default IndexPopup
