export type MetricKey =
  | "jsHeap"
  | "nodes"
  | "cpu"

export type MetricDefinition = {
  key: MetricKey
  label: string
  color: string
  precision: number
  unit: string
}

export type MetricSnapshot = {
  timestamp: number
} & Record<MetricKey, number | null>

export const SAMPLE_INTERVAL_MS = 100
export const HISTORY_SIZE = 60

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    key: "jsHeap",
    label: "JS Heap",
    color: "#0f766e",
    precision: 1,
    unit: "MB"
  },
  {
    key: "nodes",
    label: "Nodes",
    color: "#1d4ed8",
    precision: 0,
    unit: ""
  },
  {
    key: "cpu",
    label: "CPU",
    color: "#dc2626",
    precision: 1,
    unit: "%"
  }
]
