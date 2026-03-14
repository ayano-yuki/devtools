export interface LocalStorageItem {
  key: string
  value: string
}

export interface SiteOverrideRule {
  id: string
  name: string
  enabled: boolean
  targetUrlPattern: string
  userAgent: string
  localStorageItems: LocalStorageItem[]
  overwriteExistingLocalStorage: boolean
}

export interface PageOverrideSettings {
  enabled: boolean
  rules: SiteOverrideRule[]
}

export const PAGE_OVERRIDE_SETTINGS_KEY = "pageOverrideSettings"

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

const createRuleId = () =>
  `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export const createDefaultSiteOverrideRule = (
  partial: Partial<SiteOverrideRule> = {}
): SiteOverrideRule => {
  return {
    id: partial.id ?? createRuleId(),
    name: partial.name ?? "",
    enabled: partial.enabled ?? true,
    targetUrlPattern: partial.targetUrlPattern ?? "*://*/*",
    userAgent: partial.userAgent ?? DEFAULT_UA,
    localStorageItems: partial.localStorageItems ?? [{ key: "devtools.fixed_flag", value: "1" }],
    overwriteExistingLocalStorage: partial.overwriteExistingLocalStorage ?? false
  }
}

export const DEFAULT_PAGE_OVERRIDE_SETTINGS: PageOverrideSettings = {
  enabled: true,
  rules: [createDefaultSiteOverrideRule()]
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

const normalizeLocalStorageItems = (value: unknown): LocalStorageItem[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
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
}

export const normalizePageOverrideSettings = (
  value: unknown
): PageOverrideSettings => {
  const source = (value ?? {}) as Partial<PageOverrideSettings> & {
    rules?: unknown
    targetUrlPattern?: unknown
    userAgent?: unknown
    localStorageItems?: unknown
    localStorageKey?: unknown
    localStorageValue?: unknown
  }

  const parsedRules = Array.isArray(source.rules)
    ? source.rules
        .map((rawRule) => {
          if (!rawRule || typeof rawRule !== "object") {
            return null
          }

          const sourceRule = rawRule as Partial<SiteOverrideRule> & {
            localStorageItems?: unknown
          }

          const normalizedItems = normalizeLocalStorageItems(sourceRule.localStorageItems)

          return createDefaultSiteOverrideRule({
            id: typeof sourceRule.id === "string" ? sourceRule.id : undefined,
            name: typeof sourceRule.name === "string" ? sourceRule.name : "",
            enabled: typeof sourceRule.enabled === "boolean" ? sourceRule.enabled : true,
            targetUrlPattern:
              typeof sourceRule.targetUrlPattern === "string"
                ? sourceRule.targetUrlPattern
                : undefined,
            userAgent: typeof sourceRule.userAgent === "string" ? sourceRule.userAgent : undefined,
            localStorageItems: normalizedItems.length > 0 ? normalizedItems : [{ key: "", value: "" }],
            overwriteExistingLocalStorage:
              typeof sourceRule.overwriteExistingLocalStorage === "boolean"
                ? sourceRule.overwriteExistingLocalStorage
                : false
          })
        })
        .filter((rule): rule is SiteOverrideRule => rule !== null)
    : []

  const hasLegacyPair =
    typeof source.localStorageKey === "string" &&
    source.localStorageKey.length > 0 &&
    typeof source.localStorageValue === "string"

  const legacyLocalStorageItems = normalizeLocalStorageItems(source.localStorageItems)
  const normalizedLegacyItems =
    legacyLocalStorageItems.length > 0
      ? legacyLocalStorageItems
      : hasLegacyPair
        ? [{ key: source.localStorageKey, value: source.localStorageValue }]
        : createDefaultSiteOverrideRule().localStorageItems

  const normalizedRules =
    parsedRules.length > 0
      ? parsedRules
      : [
          createDefaultSiteOverrideRule({
            targetUrlPattern:
              typeof source.targetUrlPattern === "string" ? source.targetUrlPattern : undefined,
            userAgent: typeof source.userAgent === "string" ? source.userAgent : undefined,
            localStorageItems: normalizedLegacyItems
          })
        ]

  return {
    enabled:
      typeof source.enabled === "boolean"
        ? source.enabled
        : DEFAULT_PAGE_OVERRIDE_SETTINGS.enabled,
    rules: normalizedRules
  }
}
