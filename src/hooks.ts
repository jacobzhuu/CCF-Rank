import { initLocale } from "./utils/locale";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { createZToolkit } from "./utils/ztoolkit";
import { CCFRankFactory } from "./modules/ccfRank";

function ensureWindowStyle(win: _ZoteroTypes.MainWindow) {
  const doc = win.document;
  if (doc.getElementById("ccf-rank-style")) return;

  const link = doc.createElementNS("http://www.w3.org/1999/xhtml", "link");
  link.setAttribute("id", "ccf-rank-style");
  link.setAttribute("rel", "stylesheet");
  link.setAttribute(
    "href",
    `chrome://${addon.data.config.addonRef}/content/zoteroPane.css`,
  );
  (doc.documentElement || doc).appendChild(link);
}

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  await CCFRankFactory.registerCCFColumn();
  CCFRankFactory.registerNotifier();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  const windowToolkit = createZToolkit();
  addon.data.windowToolkits.set(win, windowToolkit);

  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );

  ensureWindowStyle(win);
  CCFRankFactory.registerRightClickMenu(windowToolkit);
}

async function onMainWindowUnload(win: Window): Promise<void> {
  const toolkit = addon.data.windowToolkits.get(win);
  toolkit?.unregisterAll();
  addon.data.windowToolkits.delete(win);
}

async function onShutdown(): Promise<void> {
  CCFRankFactory.unregisterNotifier();
  await CCFRankFactory.unregisterColumns();
  addon.data.windowToolkits.forEach((toolkit) => toolkit.unregisterAll());
  addon.data.windowToolkits.clear();
  ztoolkit.unregisterAll();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {}

async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window);
      break;
    default:
      return;
  }
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
};
