import type { MetricKey, MetricSnapshot } from "~/devtools/performance-types"

type MetricDefinition = {
  key: MetricKey
  label: string
  color: string
  precision: number
  unit: string
}

type MetricHistory = Record<MetricKey, Array<number | null>>

const HISTORY_SIZE = 60
const CHART_WIDTH = 260
const CHART_HEIGHT = 88
const CHART_PADDING = 8

const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    key: "jsHeap",
    label: "JS Heap",
    color: "#0f766e",
    precision: 1,
    unit: "MB"
  },
  {
    key: "documents",
    label: "Documents",
    color: "#2563eb",
    precision: 0,
    unit: ""
  },
  {
    key: "nodes",
    label: "Nodes",
    color: "#1d4ed8",
    precision: 0,
    unit: ""
  },
  {
    key: "listeners",
    label: "Listeners",
    color: "#0284c7",
    precision: 0,
    unit: ""
  },
  {
    key: "gpu",
    label: "GPU",
    color: "#ca8a04",
    precision: 1,
    unit: "MB"
  },
  {
    key: "cpu",
    label: "CPU",
    color: "#dc2626",
    precision: 1,
    unit: "%"
  }
]

const emptyHistory = (): MetricHistory => ({
  jsHeap: [],
  documents: [],
  nodes: [],
  listeners: [],
  gpu: [],
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

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")

const buildSparklinePath = (values: Array<number | null>): string | null => {
  const points = values
    .map((value, index) => ({ index, value }))
    .filter(
      (entry): entry is { index: number; value: number } =>
        entry.value !== null && Number.isFinite(entry.value)
    )

  if (points.length < 2 || values.length < 2) {
    return null
  }

  const min = Math.min(...points.map((point) => point.value))
  const max = Math.max(...points.map((point) => point.value))
  const range = max - min || 1
  const stepX = (CHART_WIDTH - CHART_PADDING * 2) / (values.length - 1)

  return points
    .map((point, pointIndex) => {
      const x = CHART_PADDING + stepX * point.index
      const normalized = (point.value - min) / range
      const y =
        CHART_HEIGHT -
        CHART_PADDING -
        normalized * (CHART_HEIGHT - CHART_PADDING * 2)
      const command = pointIndex === 0 ? "M" : "L"
      return `${command} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(" ")
}

export class PerformancePanelUI {
  private readonly root: HTMLElement
  private readonly history = emptyHistory()
  private lastUpdatedAt: number | null = null
  private errorMessage: string | null = null

  constructor(panelWindow: Window) {
    const panelRoot = panelWindow.document.getElementById("panel")
    if (!panelRoot) {
      throw new Error("Panel root (#panel) not found.")
    }

    this.root = panelRoot
    this.render()
  }

  public pushSample(sample: MetricSnapshot): void {
    this.lastUpdatedAt = sample.timestamp
    this.errorMessage = null

    for (const metric of METRIC_DEFINITIONS) {
      const values = this.history[metric.key]
      values.push(sample[metric.key])

      if (values.length > HISTORY_SIZE) {
        values.splice(0, values.length - HISTORY_SIZE)
      }
    }

    this.render()
  }

  public setError(message: string): void {
    this.errorMessage = message
    this.render()
  }

  public dispose(): void {
    this.root.innerHTML = ""
  }

  private render(): void {
    const updatedAtText =
      this.lastUpdatedAt === null
        ? "waiting for first sample..."
        : `last update ${new Date(this.lastUpdatedAt).toLocaleTimeString(
            "ja-JP",
            { hour12: false }
          )}`

    this.root.innerHTML = `
      <style>
        :root {
          color-scheme: light;
        }

        body {
          margin: 0;
          background: #f3f7ff;
          color: #0f172a;
          font-family: "Segoe UI", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
        }

        .perf-dashboard {
          box-sizing: border-box;
          min-height: 100vh;
          padding: 16px;
        }

        .perf-dashboard__header {
          margin-bottom: 12px;
        }

        .perf-dashboard__title {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
        }

        .perf-dashboard__subtitle {
          margin-top: 4px;
          font-size: 12px;
          color: #475569;
        }

        .perf-dashboard__error {
          margin-top: 10px;
          border-radius: 10px;
          border: 1px solid #ef4444;
          background: #fef2f2;
          color: #b91c1c;
          padding: 10px 12px;
          font-size: 12px;
        }

        .perf-grid {
          display: grid;
          gap: 10px;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        }

        .perf-card {
          border: 1px solid #dbe3ef;
          border-radius: 12px;
          background: #ffffff;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
          padding: 12px;
        }

        .perf-card__heading {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 8px;
        }

        .perf-card__label {
          margin: 0;
          font-size: 13px;
          font-weight: 600;
          color: #334155;
        }

        .perf-card__value {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: #020617;
        }

        .perf-card__chart {
          width: 100%;
          height: 88px;
          border-radius: 8px;
          background: linear-gradient(180deg, #f8fbff, #f1f5f9);
          border: 1px solid #e2e8f0;
        }

        .perf-card__range {
          margin-top: 6px;
          font-size: 11px;
          color: #64748b;
        }

        .perf-card__empty {
          margin-top: 30px;
          text-align: center;
          font-size: 11px;
          color: #94a3b8;
        }
      </style>

      <section class="perf-dashboard">
        <header class="perf-dashboard__header">
          <h1 class="perf-dashboard__title">Performance Metrics</h1>
          <div class="perf-dashboard__subtitle">Sampling every 1s, ${updatedAtText}</div>
          ${
            this.errorMessage
              ? `<div class="perf-dashboard__error">${escapeHtml(
                  this.errorMessage
                )}</div>`
              : ""
          }
        </header>
        <div class="perf-grid">
          ${METRIC_DEFINITIONS.map((metric) => this.renderCard(metric)).join(
            ""
          )}
        </div>
      </section>
    `
  }

  private renderCard(metric: MetricDefinition): string {
    const values = this.history[metric.key]
    const latestValue = values.at(-1) ?? null
    const path = buildSparklinePath(values)

    return `
      <article class="perf-card">
        <header class="perf-card__heading">
          <h2 class="perf-card__label">${metric.label}</h2>
          <p class="perf-card__value">${formatValue(
            latestValue,
            metric.precision,
            metric.unit
          )}</p>
        </header>
        <svg class="perf-card__chart" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" preserveAspectRatio="none">
          ${
            path
              ? `<path d="${path}" fill="none" stroke="${metric.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`
              : `<text class="perf-card__empty" x="50%" y="50%" dominant-baseline="middle" text-anchor="middle">waiting...</text>`
          }
        </svg>
        <div class="perf-card__range">${formatRange(
          values,
          metric.precision,
          metric.unit
        )}</div>
      </article>
    `
  }
}
