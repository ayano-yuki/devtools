import {
  SAMPLE_INTERVAL_MS,
  type MetricSnapshot
} from "~/src/devtools/entities/performance/model/metrics"
import { clamp } from "~/src/devtools/shared/lib/math"

type PerformanceMetric = {
  name: string
  value: number
}

type PerformanceMetricsResponse = {
  metrics?: PerformanceMetric[]
}

type DomCountersResponse = {
  nodes: number
}

type MetricMap = Record<string, number>

const DEBUGGER_PROTOCOL_VERSION = "1.3"

const CPU_COUNTER_CANDIDATES = ["TaskDuration", "ThreadTime", "ProcessTime"]

const pickMetric = (metrics: MetricMap, names: string[]): number | null => {
  for (const name of names) {
    const value = metrics[name]
    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }
  }

  return null
}

const toMetricsMap = (metrics: PerformanceMetric[] | undefined): MetricMap => {
  if (!metrics) {
    return {}
  }

  return metrics.reduce<MetricMap>((acc, metric) => {
    if (Number.isFinite(metric.value)) {
      acc[metric.name] = metric.value
    }
    return acc
  }, {})
}

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  return "Unknown error"
}

export class PerformanceMonitorClient {
  private readonly target: chrome.debugger.Debuggee
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private isAttached = false
  private isPolling = false
  private lastCpuCounter: number | null = null
  private lastCpuTimestamp: number | null = null

  constructor(
    tabId: number,
    private readonly onSample: (snapshot: MetricSnapshot) => void,
    private readonly onError: (message: string) => void
  ) {
    this.target = { tabId }
  }

  public async start(): Promise<void> {
    if (this.pollTimer !== null) {
      return
    }

    try {
      await this.attachDebugger()
      await this.sendCommand("Performance.enable")
      await this.collectAndPublish()
      this.pollTimer = setInterval(() => {
        void this.collectAndPublish()
      }, SAMPLE_INTERVAL_MS)
    } catch (error) {
      await this.stop()
      this.onError(`Failed to start performance monitoring. ${toErrorMessage(error)}`)
    }
  }

  public async stop(): Promise<void> {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }

    this.lastCpuCounter = null
    this.lastCpuTimestamp = null

    if (!this.isAttached) {
      return
    }

    try {
      await this.sendCommand("Performance.disable")
    } catch {
      // Ignore disable errors if target has already changed.
    }

    try {
      await this.detachDebugger()
    } catch {
      // Best effort cleanup.
    }
  }

  private async collectAndPublish(): Promise<void> {
    if (this.isPolling) {
      return
    }

    this.isPolling = true
    try {
      const snapshot = await this.collectSnapshot()
      this.onSample(snapshot)
    } catch (error) {
      this.onError(`Failed to collect performance metrics. ${toErrorMessage(error)}`)
    } finally {
      this.isPolling = false
    }
  }

  private async collectSnapshot(): Promise<MetricSnapshot> {
    const [performanceResponse, domCountersResponse] = await Promise.all([
      this.sendCommand<PerformanceMetricsResponse>("Performance.getMetrics"),
      this.sendCommand<DomCountersResponse>("Memory.getDOMCounters").catch(() => null)
    ])

    const metricsMap = toMetricsMap(performanceResponse.metrics)
    const jsHeapBytes = pickMetric(metricsMap, ["JSHeapUsedSize"])
    const nodes = pickMetric(metricsMap, ["Nodes"]) ?? domCountersResponse?.nodes
    const cpu = this.computeCpuUsage(metricsMap)

    return {
      timestamp: Date.now(),
      jsHeap: jsHeapBytes === null ? null : jsHeapBytes / (1024 * 1024),
      nodes: nodes ?? null,
      cpu
    }
  }

  private computeCpuUsage(metrics: MetricMap): number | null {
    const cpuCounter = pickMetric(metrics, CPU_COUNTER_CANDIDATES)
    const timestamp = pickMetric(metrics, ["Timestamp"]) ?? Date.now() / 1000

    if (cpuCounter === null) {
      this.lastCpuCounter = null
      this.lastCpuTimestamp = null
      return null
    }

    if (this.lastCpuCounter === null || this.lastCpuTimestamp === null) {
      this.lastCpuCounter = cpuCounter
      this.lastCpuTimestamp = timestamp
      return null
    }

    const counterDelta = cpuCounter - this.lastCpuCounter
    const timestampDelta = timestamp - this.lastCpuTimestamp

    this.lastCpuCounter = cpuCounter
    this.lastCpuTimestamp = timestamp

    if (counterDelta < 0 || timestampDelta <= 0) {
      return null
    }

    return clamp((counterDelta / timestampDelta) * 100, 0, 100)
  }

  private async attachDebugger(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      chrome.debugger.attach(
        this.target,
        DEBUGGER_PROTOCOL_VERSION,
        withRuntimeError(resolve, reject)
      )
    })
    this.isAttached = true
  }

  private async detachDebugger(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      chrome.debugger.detach(this.target, withRuntimeError(resolve, reject))
    })
    this.isAttached = false
  }

  private async sendCommand<T = unknown>(
    method: string,
    commandParams?: object
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      chrome.debugger.sendCommand(
        this.target,
        method,
        commandParams ?? {},
        (result) => {
          const runtimeError = chrome.runtime.lastError
          if (runtimeError) {
            reject(new Error(runtimeError.message))
            return
          }

          resolve((result ?? {}) as T)
        }
      )
    })
  }
}

const withRuntimeError =
  (resolve: () => void, reject: (reason?: unknown) => void) => () => {
    const runtimeError = chrome.runtime.lastError
    if (runtimeError) {
      reject(new Error(runtimeError.message))
      return
    }
    resolve()
  }
