import { PerformanceMetricsClient } from "~/devtools/performance-metrics-client"
import { PerformancePanelUI } from "~/devtools/performance-panel-ui"

export class PerformancePanelController {
  private readonly metricsClient: PerformanceMetricsClient
  private readonly panelUi: PerformancePanelUI

  constructor(panelWindow: Window, tabId: number) {
    this.panelUi = new PerformancePanelUI(panelWindow)
    this.metricsClient = new PerformanceMetricsClient(
      tabId,
      (sample) => this.panelUi.pushSample(sample),
      (message) => this.panelUi.setError(message)
    )
  }

  public async start(): Promise<void> {
    await this.metricsClient.start()
  }

  public async stop(): Promise<void> {
    await this.metricsClient.stop()
    this.panelUi.dispose()
  }
}
