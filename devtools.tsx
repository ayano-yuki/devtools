import myPanelHTML from "url:~/devtools/panel.html"
import { PerformancePanelController } from "~/devtools/performance-panel-controller"

let panelController: PerformancePanelController | null = null

chrome.devtools.panels.create("Performance", null, myPanelHTML, (panel) => {
  panel.onShown.addListener((panelWindow) => {
    if (panelController) {
      return
    }

    panelController = new PerformancePanelController(
      panelWindow,
      chrome.devtools.inspectedWindow.tabId
    )
    void panelController.start()
  })

  panel.onHidden.addListener(() => {
    if (!panelController) {
      return
    }
    void panelController.stop()
    panelController = null
  })
})

globalThis.addEventListener("beforeunload", () => {
  if (!panelController) {
    return
  }

  void panelController.stop()
  panelController = null
})

function IndexDevtools() {
  return <></>
}

export default IndexDevtools
