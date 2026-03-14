import { useEffect, useState, type CSSProperties } from "react"

import {
  DEFAULT_PAGE_OVERRIDE_SETTINGS,
  PAGE_OVERRIDE_SETTINGS_KEY,
  createDefaultSiteOverrideRule,
  type LocalStorageItem,
  type PageOverrideSettings,
  type SiteOverrideRule,
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

  const updateField = (key: keyof PageOverrideSettings, value: PageOverrideSettings[keyof PageOverrideSettings]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const updateRule = (index: number, patch: Partial<SiteOverrideRule>) => {
    setSettings((prev) => ({
      ...prev,
      rules: prev.rules.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule
      )
    }))
  }

  const addRule = () => {
    setSettings((prev) => ({
      ...prev,
      rules: [...prev.rules, createDefaultSiteOverrideRule({ targetUrlPattern: "" })]
    }))
  }

  const removeRule = (index: number) => {
    setSettings((prev) => ({
      ...prev,
      rules:
        prev.rules.length <= 1
          ? [createDefaultSiteOverrideRule({ targetUrlPattern: "", localStorageItems: [{ key: "", value: "" }] })]
          : prev.rules.filter((_, ruleIndex) => ruleIndex !== index)
    }))
  }

  const updateLocalStorageItem = (
    ruleIndex: number,
    itemIndex: number,
    field: keyof LocalStorageItem,
    value: string
  ) => {
    setSettings((prev) => ({
      ...prev,
      rules: prev.rules.map((rule, currentRuleIndex) => {
        if (currentRuleIndex !== ruleIndex) {
          return rule
        }

        return {
          ...rule,
          localStorageItems: rule.localStorageItems.map((item, currentItemIndex) =>
            currentItemIndex === itemIndex ? { ...item, [field]: value } : item
          )
        }
      })
    }))
  }

  const addLocalStorageItem = (ruleIndex: number) => {
    setSettings((prev) => ({
      ...prev,
      rules: prev.rules.map((rule, currentRuleIndex) =>
        currentRuleIndex === ruleIndex
          ? {
              ...rule,
              localStorageItems: [...rule.localStorageItems, { key: "", value: "" }]
            }
          : rule
      )
    }))
  }

  const removeLocalStorageItem = (ruleIndex: number, itemIndex: number) => {
    setSettings((prev) => ({
      ...prev,
      rules: prev.rules.map((rule, currentRuleIndex) => {
        if (currentRuleIndex !== ruleIndex) {
          return rule
        }

        return {
          ...rule,
          localStorageItems:
            rule.localStorageItems.length <= 1
              ? [{ key: "", value: "" }]
              : rule.localStorageItems.filter((_, currentItemIndex) => currentItemIndex !== itemIndex)
        }
      })
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
        サイト別ルールを作成できます。上から順に評価し、最初に一致したルールを適用します。
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
        <label style={labelStyle}>サイト別ルール</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {settings.rules.map((rule, ruleIndex) => (
            <div
              key={rule.id}
              style={{
                border: "1px solid #d0d7de",
                borderRadius: 10,
                padding: 12,
                backgroundColor: "#f6f8fa"
              }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong>ルール {ruleIndex + 1}</strong>
                <button
                  onClick={() => removeRule(ruleIndex)}
                  style={{
                    border: "1px solid #d0d7de",
                    borderRadius: 8,
                    padding: "4px 10px",
                    backgroundColor: "#fff",
                    cursor: "pointer",
                    fontSize: 12
                  }}>
                  ルール削除
                </button>
              </div>

              <div style={{ marginTop: 10 }}>
                <label htmlFor={`rule-name-${rule.id}`} style={{ ...labelStyle, marginBottom: 4 }}>
                  ルール名（任意）
                </label>
                <input
                  id={`rule-name-${rule.id}`}
                  value={rule.name}
                  onChange={(event) => updateRule(ruleIndex, { name: event.currentTarget.value })}
                  style={inputStyle}
                  placeholder="例: Example用"
                />
              </div>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 10,
                  fontWeight: 600
                }}>
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(event) => updateRule(ruleIndex, { enabled: event.currentTarget.checked })}
                />
                このルールを有効にする
              </label>

              <div style={{ marginTop: 10 }}>
                <label htmlFor={`rule-pattern-${rule.id}`} style={{ ...labelStyle, marginBottom: 4 }}>
                  対象URLパターン
                </label>
                <textarea
                  id={`rule-pattern-${rule.id}`}
                  value={rule.targetUrlPattern}
                  onChange={(event) =>
                    updateRule(ruleIndex, { targetUrlPattern: event.currentTarget.value })
                  }
                  style={textareaStyle}
                  placeholder={"*://example.com/*\n*://*.example.org/*"}
                />
                <div style={{ fontSize: 12, color: "#59636e", marginTop: 6 }}>
                  1行1パターン。`*` と `/regex/` が使えます。
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <label htmlFor={`rule-ua-${rule.id}`} style={{ ...labelStyle, marginBottom: 4 }}>
                  固定 User-Agent
                </label>
                <textarea
                  id={`rule-ua-${rule.id}`}
                  value={rule.userAgent}
                  onChange={(event) => updateRule(ruleIndex, { userAgent: event.currentTarget.value })}
                  style={textareaStyle}
                />
              </div>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 10,
                  fontWeight: 600
                }}>
                <input
                  type="checkbox"
                  checked={rule.overwriteExistingLocalStorage}
                  onChange={(event) =>
                    updateRule(ruleIndex, {
                      overwriteExistingLocalStorage: event.currentTarget.checked
                    })
                  }
                />
                既存のlocalStorageキーを上書きする（デフォルト: OFF / 既存キーは上書きしない）
              </label>

              <div style={{ marginTop: 10 }}>
                <label style={{ ...labelStyle, marginBottom: 4 }}>
                  localStorage 固定項目（複数可）
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {rule.localStorageItems.map((item, itemIndex) => (
                    <div
                      key={`${rule.id}-storage-item-${itemIndex}`}
                      style={{
                        border: "1px solid #d0d7de",
                        borderRadius: 8,
                        padding: 10,
                        backgroundColor: "#fff"
                      }}>
                      <div style={{ marginBottom: 8 }}>
                        <label
                          htmlFor={`storage-key-${rule.id}-${itemIndex}`}
                          style={{ ...labelStyle, marginBottom: 4, fontSize: 13 }}>
                          Key
                        </label>
                        <input
                          id={`storage-key-${rule.id}-${itemIndex}`}
                          value={item.key}
                          onChange={(event) =>
                            updateLocalStorageItem(
                              ruleIndex,
                              itemIndex,
                              "key",
                              event.currentTarget.value
                            )
                          }
                          style={inputStyle}
                        />
                      </div>

                      <div style={{ marginBottom: 8 }}>
                        <label
                          htmlFor={`storage-value-${rule.id}-${itemIndex}`}
                          style={{ ...labelStyle, marginBottom: 4, fontSize: 13 }}>
                          Value
                        </label>
                        <textarea
                          id={`storage-value-${rule.id}-${itemIndex}`}
                          value={item.value}
                          onChange={(event) =>
                            updateLocalStorageItem(
                              ruleIndex,
                              itemIndex,
                              "value",
                              event.currentTarget.value
                            )
                          }
                          style={textareaStyle}
                        />
                      </div>

                      <button
                        onClick={() => removeLocalStorageItem(ruleIndex, itemIndex)}
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
                  onClick={() => addLocalStorageItem(ruleIndex)}
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
                  localStorage項目を追加
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={addRule}
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
          サイトルールを追加
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
