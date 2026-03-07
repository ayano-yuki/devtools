import { PerformanceMonitorClient } from "~/src/devtools/features/performance-monitor/model/performance-monitor-client"
import { PerformanceDashboardWidget } from "~/src/devtools/widgets/performance-dashboard/ui/performance-dashboard-widget"

export class DevtoolsPanelController {
  private monitorClient: PerformanceMonitorClient | null = null
  private readonly dashboardWidget: PerformanceDashboardWidget
  private isRefreshing = false
  private monitorSessionId = 0

  constructor(
    panelWindow: Window,
    private readonly getCurrentTabId: () => number
  ) {
    this.dashboardWidget = new PerformanceDashboardWidget(panelWindow)
  }

  public async start(): Promise<void> {
    await this.refresh()
  }

  public async refresh(): Promise<void> {
    if (this.isRefreshing) {
      return
    }

    this.isRefreshing = true
    this.monitorSessionId += 1
    const currentSessionId = this.monitorSessionId
    this.dashboardWidget.reset()

    try {
      const previousClient = this.monitorClient
      this.monitorClient = null
      if (previousClient) {
        await previousClient.stop()
      }

      this.monitorClient = this.createMonitorClient(
        this.getCurrentTabId(),
        currentSessionId
      )
      await this.monitorClient.start()
    } finally {
      this.isRefreshing = false
    }
  }

  public async stop(): Promise<void> {
    this.monitorSessionId += 1
    if (this.monitorClient) {
      await this.monitorClient.stop()
      this.monitorClient = null
    }
    this.dashboardWidget.dispose()
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

}
