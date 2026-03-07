import {
  type MonitorThrottlingConfig,
  PerformanceMonitorClient
} from "~/src/devtools/features/performance-monitor/model/performance-monitor-client"
import { PerformanceDashboardWidget } from "~/src/devtools/widgets/performance-dashboard/ui/performance-dashboard-widget"

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  return "Unknown error"
}

export class DevtoolsPanelController {
  private monitorClient: PerformanceMonitorClient | null = null
  private readonly dashboardWidget: PerformanceDashboardWidget
  private readonly throttleForm: HTMLFormElement
  private readonly cpuRateInput: HTMLInputElement
  private readonly latencyInput: HTMLInputElement
  private readonly downloadInput: HTMLInputElement
  private readonly uploadInput: HTMLInputElement
  private readonly offlineInput: HTMLInputElement
  private readonly startButton: HTMLButtonElement
  private readonly stopButton: HTMLButtonElement
  private isRefreshing = false
  private isMonitoring = false
  private monitorSessionId = 0
  private controlsBound = false

  private readonly handleStartSubmit = (event: Event): void => {
    event.preventDefault()
    void this.refresh()
  }

  private readonly handleStopClick = (): void => {
    void this.stopMonitoring()
  }

  constructor(
    panelWindow: Window,
    private readonly getCurrentTabId: () => number
  ) {
    this.dashboardWidget = new PerformanceDashboardWidget(panelWindow)
    this.throttleForm = this.getById<HTMLFormElement>(panelWindow.document, "throttleForm")
    this.cpuRateInput = this.getById<HTMLInputElement>(panelWindow.document, "cpuRateInput")
    this.latencyInput = this.getById<HTMLInputElement>(panelWindow.document, "latencyInput")
    this.downloadInput = this.getById<HTMLInputElement>(panelWindow.document, "downloadInput")
    this.uploadInput = this.getById<HTMLInputElement>(panelWindow.document, "uploadInput")
    this.offlineInput = this.getById<HTMLInputElement>(panelWindow.document, "offlineInput")
    this.startButton = this.getById<HTMLButtonElement>(panelWindow.document, "startButton")
    this.stopButton = this.getById<HTMLButtonElement>(panelWindow.document, "stopButton")
  }

  public async start(): Promise<void> {
    this.bindControls()
    this.updateControlState()
    await this.refresh()
  }

  public async refresh(): Promise<void> {
    if (this.isRefreshing) {
      return
    }

    this.isRefreshing = true
    this.updateControlState()
    this.monitorSessionId += 1
    const currentSessionId = this.monitorSessionId
    const throttlingConfig = this.readThrottlingConfig()
    this.dashboardWidget.reset()

    try {
      const previousClient = this.monitorClient
      this.monitorClient = null
      if (previousClient) {
        await previousClient.stop()
      }

      if (currentSessionId !== this.monitorSessionId) {
        this.isMonitoring = false
        return
      }

      const nextClient = this.createMonitorClient(
        this.getCurrentTabId(),
        currentSessionId
      )
      this.monitorClient = nextClient

      const started = await nextClient.start(throttlingConfig)
      if (!started) {
        if (this.monitorClient === nextClient) {
          this.monitorClient = null
        }
        this.isMonitoring = false
        return
      }

      if (currentSessionId !== this.monitorSessionId) {
        await nextClient.stop()
        if (this.monitorClient === nextClient) {
          this.monitorClient = null
        }
        this.isMonitoring = false
        return
      }

      this.isMonitoring = true
    } catch (error) {
      this.monitorClient = null
      this.isMonitoring = false
      this.dashboardWidget.setError(
        `Failed to refresh performance monitoring. ${toErrorMessage(error)}`
      )
    } finally {
      this.isRefreshing = false
      this.updateControlState()
    }
  }

  public async stop(): Promise<void> {
    this.unbindControls()
    await this.stopMonitoring()
    this.dashboardWidget.dispose()
  }

  private async stopMonitoring(): Promise<void> {
    this.monitorSessionId += 1
    if (this.monitorClient) {
      await this.monitorClient.stop()
      this.monitorClient = null
    }
    this.isMonitoring = false
    this.updateControlState()
  }

  private createMonitorClient(
    tabId: number,
    sessionId: number
  ): PerformanceMonitorClient {
    return new PerformanceMonitorClient(
      tabId,
      (snapshot) => {
        if (sessionId !== this.monitorSessionId) {
          return
        }
        this.dashboardWidget.pushSample(snapshot)
      },
      (message) => {
        if (sessionId !== this.monitorSessionId) {
          return
        }
        this.dashboardWidget.setError(message)
      }
    )
  }

  private bindControls(): void {
    if (this.controlsBound) {
      return
    }

    this.controlsBound = true
    this.throttleForm.addEventListener("submit", this.handleStartSubmit)
    this.stopButton.addEventListener("click", this.handleStopClick)
  }

  private unbindControls(): void {
    if (!this.controlsBound) {
      return
    }

    this.controlsBound = false
    this.throttleForm.removeEventListener("submit", this.handleStartSubmit)
    this.stopButton.removeEventListener("click", this.handleStopClick)
  }

  private updateControlState(): void {
    this.startButton.disabled = this.isRefreshing
    this.stopButton.disabled = this.isRefreshing || !this.isMonitoring

    const disableInputs = this.isRefreshing
    this.cpuRateInput.disabled = disableInputs
    this.latencyInput.disabled = disableInputs
    this.downloadInput.disabled = disableInputs
    this.uploadInput.disabled = disableInputs
    this.offlineInput.disabled = disableInputs
  }

  private readThrottlingConfig(): MonitorThrottlingConfig {
    return {
      cpuRate: this.readBoundedNumber(this.cpuRateInput, 1, 20, 1),
      network: {
        offline: this.offlineInput.checked,
        latencyMs: this.readBoundedNumber(this.latencyInput, 0, 120_000, 0),
        downloadKbps: this.readOptionalPositiveNumber(this.downloadInput),
        uploadKbps: this.readOptionalPositiveNumber(this.uploadInput)
      }
    }
  }

  private readBoundedNumber(
    input: HTMLInputElement,
    min: number,
    max: number,
    fallback: number
  ): number {
    const parsed = Number(input.value)
    if (!Number.isFinite(parsed)) {
      input.value = String(fallback)
      return fallback
    }

    const bounded = Math.min(max, Math.max(min, parsed))
    const normalized = Math.round(bounded * 10) / 10
    input.value = String(normalized)
    return normalized
  }

  private readOptionalPositiveNumber(input: HTMLInputElement): number | null {
    const parsed = Number(input.value)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      input.value = "0"
      return null
    }

    const normalized = Math.min(1_000_000, Math.round(parsed))
    input.value = String(normalized)
    return normalized
  }

  private getById<T extends HTMLElement>(document: Document, id: string): T {
    const element = document.getElementById(id)
    if (!element) {
      throw new Error(`Element #${id} not found in panel.html.`)
    }
    return element as T
  }
}
