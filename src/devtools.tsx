import myPanelHTML from "url:~/devtools/panel.html"
import { DevtoolsPanelController } from "~/src/devtools/pages/devtools-panel/model/devtools-panel-controller"

let panelController: DevtoolsPanelController | null = null

chrome.devtools.panels.create("DEV", null, myPanelHTML, (panel) => {
  panel.onShown.addListener((panelWindow) => {
    if (panelController) {
      void panelController.refresh()
      return
    }

    panelController = new DevtoolsPanelController(
      panelWindow,
      () => chrome.devtools.inspectedWindow.tabId
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

const DevtoolsEntry = () => null

export default DevtoolsEntry
