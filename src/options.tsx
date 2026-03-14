import { useEffect, useState, type CSSProperties } from "react"

import {
  DEFAULT_PAGE_OVERRIDE_SETTINGS,
  PAGE_OVERRIDE_SETTINGS_KEY,
  type LocalStorageItem,
  type PageOverrideSettings,
  normalizePageOverrideSettings
} from "~src/shared/page-overrides-settings"

const containerStyle: CSSProperties = {
  maxWidth: 720,
  margin: "24px auto",
  padding: "0 16px 24px",
  fontFamily: "system-ui, -apple-system, sans-serif",
  lineHeight: 1.5
}

const labelStyle: CSSProperties = {
  display: "block",
  fontWeight: 600,
  marginBottom: 6
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #d0d7de",
  borderRadius: 8,
  fontSize: 14,
  boxSizing: "border-box"
}

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 96,
  resize: "vertical"
}

function OptionsPage() {
  const [settings, setSettings] = useState<PageOverrideSettings>(DEFAULT_PAGE_OVERRIDE_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState("")

  useEffect(() => {
    chrome.storage.sync
      .get(PAGE_OVERRIDE_SETTINGS_KEY)
      .then((result) => {
        setSettings(normalizePageOverrideSettings(result[PAGE_OVERRIDE_SETTINGS_KEY]))
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  const updateField = <K extends keyof PageOverrideSettings>(
    key: K,
    value: PageOverrideSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const updateLocalStorageItem = (
    index: number,
    field: keyof LocalStorageItem,
    value: string
  ) => {
    setSettings((prev) => ({
      ...prev,
      localStorageItems: prev.localStorageItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    }))
  }

  const addLocalStorageItem = () => {
    setSettings((prev) => ({
      ...prev,
      localStorageItems: [...prev.localStorageItems, { key: "", value: "" }]
    }))
  }

  const removeLocalStorageItem = (index: number) => {
    setSettings((prev) => ({
      ...prev,
      localStorageItems:
        prev.localStorageItems.length <= 1
          ? [{ key: "", value: "" }]
          : prev.localStorageItems.filter((_, itemIndex) => itemIndex !== index)
    }))
  }

  const save = async () => {
    await chrome.storage.sync.set({
      [PAGE_OVERRIDE_SETTINGS_KEY]: settings
    })
    setStatus("保存しました。UA変更はページ再読み込み後に反映されます。")
  }

  if (loading) {
    return (
      <div style={containerStyle}>
        <h1>Options</h1>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <h1 style={{ marginBottom: 8 }}>UA / LocalStorage 固定化</h1>
      <p style={{ marginTop: 0, color: "#59636e" }}>
        指定URLに一致したページだけ、User-AgentとlocalStorageの固定値を適用します。
      </p>

      <section style={{ marginBottom: 18 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) => updateField("enabled", event.currentTarget.checked)}
          />
          固定化設定を有効にする
        </label>
      </section>

      <section style={{ marginBottom: 18 }}>
        <label htmlFor="targetUrlPattern" style={labelStyle}>
          対象URLパターン
        </label>
        <textarea
          id="targetUrlPattern"
          value={settings.targetUrlPattern}
          onChange={(event) => updateField("targetUrlPattern", event.currentTarget.value)}
          style={textareaStyle}
          placeholder={"*://example.com/*\n*://*.example.org/*"}
        />
        <div style={{ fontSize: 12, color: "#59636e", marginTop: 6 }}>
          1行1パターン。`*` ワイルドカード対応。`/regex/` 形式の正規表現も使えます。
        </div>
      </section>

      <section style={{ marginBottom: 18 }}>
        <label htmlFor="fixedUa" style={labelStyle}>
          固定 User-Agent
        </label>
        <textarea
          id="fixedUa"
          value={settings.userAgent}
          onChange={(event) => updateField("userAgent", event.currentTarget.value)}
          style={textareaStyle}
        />
      </section>

      <section style={{ marginBottom: 18 }}>
        <label style={labelStyle}>localStorage 固定項目（複数可）</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {settings.localStorageItems.map((item, index) => (
            <div
              key={`storage-item-${index}`}
              style={{
                border: "1px solid #d0d7de",
                borderRadius: 8,
                padding: 10,
                backgroundColor: "#f6f8fa"
              }}>
              <div style={{ marginBottom: 8 }}>
                <label
                  htmlFor={`storage-key-${index}`}
                  style={{ ...labelStyle, marginBottom: 4, fontSize: 13 }}>
                  Key
                </label>
                <input
                  id={`storage-key-${index}`}
                  value={item.key}
                  onChange={(event) =>
                    updateLocalStorageItem(index, "key", event.currentTarget.value)
                  }
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: 8 }}>
                <label
                  htmlFor={`storage-value-${index}`}
                  style={{ ...labelStyle, marginBottom: 4, fontSize: 13 }}>
                  Value
                </label>
                <textarea
                  id={`storage-value-${index}`}
                  value={item.value}
                  onChange={(event) =>
                    updateLocalStorageItem(index, "value", event.currentTarget.value)
                  }
                  style={textareaStyle}
                />
              </div>
              <button
                onClick={() => removeLocalStorageItem(index)}
                style={{
                  border: "1px solid #d0d7de",
                  borderRadius: 8,
                  padding: "6px 10px",
                  backgroundColor: "#fff",
                  cursor: "pointer",
                  fontSize: 12
                }}>
                この項目を削除
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addLocalStorageItem}
          style={{
            marginTop: 10,
            border: "1px solid #1f6feb",
            color: "#1f6feb",
            borderRadius: 8,
            padding: "8px 12px",
            backgroundColor: "#fff",
            cursor: "pointer",
            fontWeight: 600
          }}>
          項目を追加
        </button>
      </section>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={save}
          style={{
            border: "none",
            borderRadius: 8,
            padding: "10px 16px",
            backgroundColor: "#0969da",
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer"
          }}>
          保存
        </button>
        <button
          onClick={() => setSettings(DEFAULT_PAGE_OVERRIDE_SETTINGS)}
          style={{
            border: "1px solid #d0d7de",
            borderRadius: 8,
            padding: "10px 16px",
            backgroundColor: "#fff",
            cursor: "pointer"
          }}>
          初期値に戻す
        </button>
        {status ? <span style={{ color: "#1a7f37", fontSize: 13 }}>{status}</span> : null}
      </div>
    </div>
  )
}

export default OptionsPage
