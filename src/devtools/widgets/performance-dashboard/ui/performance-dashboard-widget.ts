import {
  HISTORY_SIZE,
  METRIC_DEFINITIONS,
  SAMPLE_INTERVAL_MS,
  type MetricDefinition,
  type MetricKey,
  type MetricSnapshot
} from "~/src/devtools/entities/performance/model/metrics"

type MetricHistory = Record<MetricKey, Array<number | null>>

type MetricCardElements = {
  root: HTMLElement
  value: HTMLElement
  range: HTMLElement
  sparklinePath: SVGPathElement
  waitingText: SVGTextElement
}

const CHART_WIDTH = 260
const CHART_HEIGHT = 88
const CHART_PADDING = 8
const SVG_NS = "http://www.w3.org/2000/svg"
const SAMPLING_INTERVAL_TEXT = `${SAMPLE_INTERVAL_MS / 1000}s`

const emptyHistory = (): MetricHistory => ({
  jsHeap: [],
  nodes: [],
  cpu: []
})

const formatValue = (
  value: number | null,
  precision: number,
  unit: string
): string => {
  if (value === null || !Number.isFinite(value)) {
    return "N/A"
  }

  const formatted = value.toFixed(precision)
  return unit ? `${formatted} ${unit}` : formatted
}

const formatRange = (
  values: Array<number | null>,
  precision: number,
  unit: string
): string => {
  const numericValues = values.filter(
    (value): value is number => value !== null && Number.isFinite(value)
  )

  if (numericValues.length === 0) {
    return "No data"
  }

  const min = Math.min(...numericValues)
  const max = Math.max(...numericValues)
  return `min ${formatValue(min, precision, unit)} / max ${formatValue(
    max,
    precision,
    unit
  )}`
}

const buildSparklinePath = (values: Array<number | null>): string | null => {
  const points = values
    .map((value, index) => ({ index, value }))
    .filter(
      (point): point is { index: number; value: number } =>
        point.value !== null && Number.isFinite(point.value)
    )

  if (values.length < 2 || points.length < 2) {
    return null
  }

  const min = Math.min(...points.map((point) => point.value))
  const max = Math.max(...points.map((point) => point.value))
  const range = max - min || 1
  const stepX = (CHART_WIDTH - CHART_PADDING * 2) / (values.length - 1)

  return points
    .map((point, index) => {
      const x = CHART_PADDING + point.index * stepX
      const normalized = (point.value - min) / range
      const y =
        CHART_HEIGHT -
        CHART_PADDING -
        normalized * (CHART_HEIGHT - CHART_PADDING * 2)
      const command = index === 0 ? "M" : "L"
      return `${command} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(" ")
}

export class PerformanceDashboardWidget {
  private readonly document: Document
  private readonly gridElement: HTMLElement
  private readonly statusTextElement: HTMLElement
  private readonly errorTextElement: HTMLElement
  private readonly history: MetricHistory = emptyHistory()
  private readonly cards = new Map<MetricKey, MetricCardElements>()
  private lastUpdatedAt: number | null = null

  constructor(panelWindow: Window) {
    this.document = panelWindow.document
    this.gridElement = this.getById("metricsGrid")
    this.statusTextElement = this.getById("statusText")
    this.errorTextElement = this.getById("errorText")

    this.mountCards()
    this.updateStatusText()
  }

  public pushSample(snapshot: MetricSnapshot): void {
    this.lastUpdatedAt = snapshot.timestamp
    this.setError(null)

    for (const metric of METRIC_DEFINITIONS) {
      const values = this.history[metric.key]
      values.push(snapshot[metric.key])
      if (values.length > HISTORY_SIZE) {
        values.splice(0, values.length - HISTORY_SIZE)
      }
      this.updateCard(metric)
    }

    this.updateStatusText()
  }

  public setError(message: string | null): void {
    if (!message) {
      this.errorTextElement.hidden = true
      this.errorTextElement.textContent = ""
      return
    }

    this.errorTextElement.hidden = false
    this.errorTextElement.textContent = message
  }

  public reset(): void {
    for (const metric of METRIC_DEFINITIONS) {
      this.history[metric.key] = []
      this.updateCard(metric)
    }

    this.lastUpdatedAt = null
    this.setError(null)
    this.updateStatusText()
  }

  public dispose(): void {
    this.gridElement.innerHTML = ""
    this.cards.clear()
  }

  private mountCards(): void {
    this.gridElement.innerHTML = ""

    for (const metric of METRIC_DEFINITIONS) {
      const card = this.createCard(metric)
      this.cards.set(metric.key, card)
      this.gridElement.appendChild(card.root)
      this.updateCard(metric)
    }
  }

  private createCard(metric: MetricDefinition): MetricCardElements {
    const card = this.document.createElement("article")
    card.className = "perf-card"

    const header = this.document.createElement("header")
    header.className = "perf-card__heading"

    const label = this.document.createElement("h2")
    label.className = "perf-card__label"
    label.textContent = metric.label

    const value = this.document.createElement("p")
    value.className = "perf-card__value"
    value.textContent = "N/A"

    header.append(label, value)

    const svg = this.document.createElementNS(SVG_NS, "svg")
    svg.setAttribute("class", "perf-card__chart")
    svg.setAttribute("viewBox", `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`)
    svg.setAttribute("preserveAspectRatio", "none")

    const sparklinePath = this.document.createElementNS(SVG_NS, "path")
    sparklinePath.setAttribute("fill", "none")
    sparklinePath.setAttribute("stroke", metric.color)
    sparklinePath.setAttribute("stroke-width", "2")
    sparklinePath.setAttribute("stroke-linecap", "round")
    sparklinePath.setAttribute("stroke-linejoin", "round")

    const waitingText = this.document.createElementNS(SVG_NS, "text")
    waitingText.setAttribute("class", "perf-card__empty")
    waitingText.setAttribute("x", "50%")
    waitingText.setAttribute("y", "50%")
    waitingText.setAttribute("dominant-baseline", "middle")
    waitingText.setAttribute("text-anchor", "middle")
    waitingText.textContent = "waiting..."

    svg.append(sparklinePath, waitingText)

    const range = this.document.createElement("div")
    range.className = "perf-card__range"
    range.textContent = "No data"

    card.append(header, svg, range)

    return { root: card, value, range, sparklinePath, waitingText }
  }

  private updateCard(metric: MetricDefinition): void {
    const cardElements = this.cards.get(metric.key)
    if (!cardElements) {
      return
    }

    const values = this.history[metric.key]
    const latest = values.at(-1) ?? null
    const sparklinePath = buildSparklinePath(values)

    cardElements.value.textContent = formatValue(
      latest,
      metric.precision,
      metric.unit
    )
    cardElements.range.textContent = formatRange(
      values,
      metric.precision,
      metric.unit
    )

    if (!sparklinePath) {
      cardElements.sparklinePath.removeAttribute("d")
      cardElements.waitingText.style.display = "block"
      return
    }

    cardElements.sparklinePath.setAttribute("d", sparklinePath)
    cardElements.waitingText.style.display = "none"
  }

  private updateStatusText(): void {
    if (this.lastUpdatedAt === null) {
      this.statusTextElement.textContent = `Sampling every ${SAMPLING_INTERVAL_TEXT}, waiting for first sample...`
      return
    }

    const time = new Date(this.lastUpdatedAt).toLocaleTimeString("ja-JP", {
      hour12: false
    })
    this.statusTextElement.textContent = `Sampling every ${SAMPLING_INTERVAL_TEXT}, last update ${time}`
  }

  private getById(id: string): HTMLElement {
    const element = this.document.getElementById(id)
    if (!element) {
      throw new Error(`Element #${id} not found in panel.html.`)
    }
    return element
  }
}
