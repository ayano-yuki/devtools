export type MetricKey =
  | "jsHeap"
  | "documents"
  | "nodes"
  | "listeners"
  | "gpu"
  | "cpu"

export type MetricSnapshot = {
  timestamp: number
} & Record<MetricKey, number | null>
