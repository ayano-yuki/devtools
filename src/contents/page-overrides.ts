import type { PlasmoCSConfig } from "plasmo"

import {
  type LocalStorageItem,
  PAGE_OVERRIDE_SETTINGS_KEY,
  matchesTargetUrl,
  normalizePageOverrideSettings
} from "~src/shared/page-overrides-settings"

export const config: PlasmoCSConfig = {
  matches: ["http://*/*", "https://*/*"],
  run_at: "document_start"
}

const createInjectedScript = (
  userAgent: string,
  localStorageItems: LocalStorageItem[],
  overwriteExistingLocalStorage: boolean
) => `
(() => {
  try {
    const fixedUserAgent = ${JSON.stringify(userAgent)};
    const storageItems = ${JSON.stringify(localStorageItems)};
    const overwriteExisting = ${JSON.stringify(overwriteExistingLocalStorage)};

    if (fixedUserAgent) {
      const userAgentGetter = () => fixedUserAgent;

      try {
        Object.defineProperty(Navigator.prototype, "userAgent", {
          get: userAgentGetter,
          configurable: true
        });
      } catch (_) {}

      try {
        Object.defineProperty(window.navigator, "userAgent", {
          get: userAgentGetter,
          configurable: true
        });
      } catch (_) {}
    }

    if (Array.isArray(storageItems)) {
      for (const item of storageItems) {
        if (!item || typeof item.key !== "string" || item.key.length === 0) {
          continue;
        }
        const value = typeof item.value === "string" ? item.value : String(item.value ?? "");

        try {
          const hasExisting = window.localStorage.getItem(item.key) !== null;
          if (hasExisting && !overwriteExisting) {
            continue;
          }
          window.localStorage.setItem(item.key, value);
        } catch (_) {}
      }
    }
  } catch (_) {}
})();
`

const injectToPageContext = (scriptBody: string, attempt = 0) => {
  const parent = document.head ?? document.documentElement
  if (!parent) {
    if (attempt < 10) {
      setTimeout(() => injectToPageContext(scriptBody, attempt + 1), 0)
    }
    return
  }

  const script = document.createElement("script")
  script.textContent = scriptBody
  parent.prepend(script)
  script.remove()
}

const applyOverridesForCurrentPage = async () => {
  try {
    const result = await chrome.storage.sync.get(PAGE_OVERRIDE_SETTINGS_KEY)
    const settings = normalizePageOverrideSettings(result[PAGE_OVERRIDE_SETTINGS_KEY])

    if (!settings.enabled) {
      return
    }

    const matchedRule = settings.rules.find(
      (rule) => rule.enabled && matchesTargetUrl(rule.targetUrlPattern, window.location.href)
    )
    if (!matchedRule) {
      return
    }

    injectToPageContext(
      createInjectedScript(
        matchedRule.userAgent,
        matchedRule.localStorageItems,
        matchedRule.overwriteExistingLocalStorage
      )
    )
  } catch {
    // ignore
  }
}

void applyOverridesForCurrentPage()
