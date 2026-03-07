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

export type NetworkThrottlingConfig = {
  offline: boolean
  latencyMs: number
  downloadKbps: number | null
  uploadKbps: number | null
}

export type MonitorThrottlingConfig = {
  cpuRate: number
  network: NetworkThrottlingConfig
}

const DEBUGGER_PROTOCOL_VERSION = "1.3"

const CPU_COUNTER_CANDIDATES = ["TaskDuration", "ThreadTime", "ProcessTime"]
const NO_THROUGHPUT_LIMIT = -1
const BYTES_PER_KILOBIT = 1000 / 8

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

const toThroughputBytesPerSecond = (kbps: number | null): number => {
  if (kbps === null) {
    return NO_THROUGHPUT_LIMIT
  }

  return Math.max(1, Math.round(kbps * BYTES_PER_KILOBIT))
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

  public async start(): Promise<boolean> {
    if (this.pollTimer !== null) {
      return true
    }

    try {
      await this.attachDebugger()
      await this.sendCommand("Performance.enable")
      await this.collectAndPublish()
      this.pollTimer = setInterval(() => {
        void this.collectAndPublish()
      }, SAMPLE_INTERVAL_MS)
      return true
    } catch (error) {
      await this.stop()
      this.onError(`Failed to start performance monitoring. ${toErrorMessage(error)}`)
      return false
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

    await this.resetThrottling()

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

  public async setThrottling(
    throttlingConfig: MonitorThrottlingConfig
  ): Promise<void> {
    if (!this.isAttached) {
      return
    }

    await this.applyThrottling(throttlingConfig)
  }

  public async clearThrottling(): Promise<void> {
    if (!this.isAttached) {
      return
    }

    await this.resetThrottling()
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

  private async applyThrottling(
    throttlingConfig: MonitorThrottlingConfig
  ): Promise<void> {
    await this.applyCpuThrottling(throttlingConfig.cpuRate)
    await this.applyNetworkThrottling(throttlingConfig.network)
  }

  private async applyCpuThrottling(rate: number): Promise<void> {
    try {
      await this.sendCommand("Emulation.setCPUThrottlingRate", { rate })
    } catch (error) {
      this.onError(
        `Failed to apply CPU throttling (${rate.toFixed(1)}x). ${toErrorMessage(error)}`
      )
    }
  }

  private async applyNetworkThrottling(
    network: NetworkThrottlingConfig
  ): Promise<void> {
    try {
      await this.sendCommand("Network.enable")
    } catch (error) {
      this.onError(`Failed to enable network throttling. ${toErrorMessage(error)}`)
      return
    }

    try {
      await this.sendCommand("Network.emulateNetworkConditions", {
        offline: network.offline,
        latency: network.latencyMs,
        downloadThroughput: toThroughputBytesPerSecond(network.downloadKbps),
        uploadThroughput: toThroughputBytesPerSecond(network.uploadKbps)
      })
    } catch (error) {
      this.onError(`Failed to apply network throttling. ${toErrorMessage(error)}`)
    }
  }

  private async resetThrottling(): Promise<void> {
    try {
      await this.sendCommand("Emulation.setCPUThrottlingRate", { rate: 1 })
    } catch {
      // Best effort cleanup.
    }

    try {
      await this.sendCommand("Network.emulateNetworkConditions", {
        offline: false,
        latency: 0,
        downloadThroughput: NO_THROUGHPUT_LIMIT,
        uploadThroughput: NO_THROUGHPUT_LIMIT
      })
    } catch {
      // Ignore if network emulation was never enabled.
    }

    try {
      await this.sendCommand("Network.disable")
    } catch {
      // Ignore if network domain is unavailable.
    }
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
