export interface LocalStorageItem {
  key: string
  value: string
}

export interface PageOverrideSettings {
  enabled: boolean
  targetUrlPattern: string
  userAgent: string
  localStorageItems: LocalStorageItem[]
}

export const PAGE_OVERRIDE_SETTINGS_KEY = "pageOverrideSettings"

export const DEFAULT_PAGE_OVERRIDE_SETTINGS: PageOverrideSettings = {
  enabled: true,
  targetUrlPattern: "*://*/*",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  localStorageItems: [{ key: "devtools.fixed_flag", value: "1" }]
}

const splitPatterns = (patternText: string) =>
  patternText
    .split(/\r?\n|,/)
    .map((pattern) => pattern.trim())
    .filter(Boolean)

const wildcardToRegExp = (pattern: string) => {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`^${escaped.replace(/\\\*/g, ".*")}$`)
}

const matchesSinglePattern = (pattern: string, url: string) => {
  if (pattern === "*" || pattern === "<all_urls>") {
    return true
  }

  const isRegex = pattern.startsWith("/") && pattern.endsWith("/") && pattern.length > 2
  if (isRegex) {
    try {
      const regex = new RegExp(pattern.slice(1, -1))
      return regex.test(url)
    } catch {
      return false
    }
  }

  if (pattern.includes("*")) {
    return wildcardToRegExp(pattern).test(url)
  }

  return url.includes(pattern)
}

export const matchesTargetUrl = (patternText: string, url: string) => {
  const patterns = splitPatterns(patternText)
  if (patterns.length === 0) {
    return true
  }

  return patterns.some((pattern) => matchesSinglePattern(pattern, url))
}

export const normalizePageOverrideSettings = (
  value: unknown
): PageOverrideSettings => {
  const source = (value ?? {}) as Partial<PageOverrideSettings> & {
    localStorageKey?: unknown
    localStorageValue?: unknown
  }

  const parsedLocalStorageItems = Array.isArray(source.localStorageItems)
    ? source.localStorageItems
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null
          }

          const sourceItem = item as Partial<LocalStorageItem>
          return {
            key: typeof sourceItem.key === "string" ? sourceItem.key : "",
            value: typeof sourceItem.value === "string" ? sourceItem.value : ""
          }
        })
        .filter((item): item is LocalStorageItem => item !== null)
    : []

  const hasLegacyPair =
    typeof source.localStorageKey === "string" &&
    source.localStorageKey.length > 0 &&
    typeof source.localStorageValue === "string"

  const normalizedLocalStorageItems =
    parsedLocalStorageItems.length > 0
      ? parsedLocalStorageItems
      : hasLegacyPair
        ? [{ key: source.localStorageKey, value: source.localStorageValue }]
        : DEFAULT_PAGE_OVERRIDE_SETTINGS.localStorageItems

  return {
    enabled:
      typeof source.enabled === "boolean"
        ? source.enabled
        : DEFAULT_PAGE_OVERRIDE_SETTINGS.enabled,
    targetUrlPattern:
      typeof source.targetUrlPattern === "string"
        ? source.targetUrlPattern
        : DEFAULT_PAGE_OVERRIDE_SETTINGS.targetUrlPattern,
    userAgent:
      typeof source.userAgent === "string"
        ? source.userAgent
        : DEFAULT_PAGE_OVERRIDE_SETTINGS.userAgent,
    localStorageItems: normalizedLocalStorageItems
  }
}
