import { CCFRankFactory } from "./ccfRank";
import { setPref } from "../utils/prefs";
import { clampMinMatchScore, getCCFSettings } from "./ccf/settings";

const LISTENER_MARK = "__ccfRankBoundEvents";

function setCheckboxValue(doc: Document, id: string, checked: boolean) {
  const element = doc.getElementById(id) as any;
  if (!element) return;
  element.checked = checked;
}

function bindEventOnce(
  element: EventTarget | null,
  event: string,
  listener: EventListener,
) {
  const target = element as any;
  if (!target) return;

  const boundEvents = (target[LISTENER_MARK] ||= new Set<string>());
  if (boundEvents.has(event)) return;

  target.addEventListener(event, listener);
  boundEvents.add(event);
}

function bindCheckbox<
  K extends
    | "autoLookupEnabled"
    | "writeCacheToExtra"
    | "showAbbrColumn"
    | "enableDebugLog",
>(doc: Document, id: string, key: K, onChanged?: () => Promise<void> | void) {
  const element = doc.getElementById(id) as any;
  if (!element) return;

  bindEventOnce(element, "command", async () => {
    setPref(key, Boolean(element.checked));
    await onChanged?.();
  });
}

async function runWithButtonDisabled(
  button: Element | null,
  task: () => Promise<void>,
) {
  if (!button) {
    await task();
    return;
  }

  const control = button as any;
  control.disabled = true;
  try {
    await task();
  } finally {
    control.disabled = false;
  }
}

export async function registerPrefsScripts(window: Window) {
  const doc = window.document;
  const settings = getCCFSettings();

  setCheckboxValue(
    doc,
    "zotero-prefpane-__addonRef__-auto-lookup-enabled",
    settings.autoLookupEnabled,
  );
  setCheckboxValue(
    doc,
    "zotero-prefpane-__addonRef__-write-cache-to-extra",
    settings.writeCacheToExtra,
  );
  setCheckboxValue(
    doc,
    "zotero-prefpane-__addonRef__-show-abbr-column",
    settings.showAbbrColumn,
  );
  setCheckboxValue(
    doc,
    "zotero-prefpane-__addonRef__-enable-debug-log",
    settings.enableDebugLog,
  );

  const aliasRulesInput = doc.getElementById(
    "zotero-prefpane-__addonRef__-custom-alias-rules",
  ) as HTMLTextAreaElement | null;
  if (aliasRulesInput) {
    aliasRulesInput.value = String(settings.customAliasRules || "");
    bindEventOnce(aliasRulesInput, "change", () => {
      setPref("customAliasRules", aliasRulesInput.value);
      void CCFRankFactory.onSettingsChanged();
    });
  }

  const minScoreInput = doc.getElementById(
    "zotero-prefpane-__addonRef__-min-match-score",
  ) as HTMLInputElement | null;
  if (minScoreInput) {
    minScoreInput.value = String(settings.minMatchScore);
    bindEventOnce(minScoreInput, "change", () => {
      const nextValue = clampMinMatchScore(Number(minScoreInput.value));
      minScoreInput.value = String(nextValue);
      setPref("minMatchScore", nextValue);
      void CCFRankFactory.onSettingsChanged();
    });
  }

  bindCheckbox(
    doc,
    "zotero-prefpane-__addonRef__-auto-lookup-enabled",
    "autoLookupEnabled",
  );
  bindCheckbox(
    doc,
    "zotero-prefpane-__addonRef__-write-cache-to-extra",
    "writeCacheToExtra",
    () => CCFRankFactory.onSettingsChanged(),
  );
  bindCheckbox(
    doc,
    "zotero-prefpane-__addonRef__-show-abbr-column",
    "showAbbrColumn",
    () => CCFRankFactory.onSettingsChanged({ syncColumns: true }),
  );
  bindCheckbox(
    doc,
    "zotero-prefpane-__addonRef__-enable-debug-log",
    "enableDebugLog",
  );

  const rescanCollectionButton = doc.getElementById(
    "zotero-prefpane-__addonRef__-rescan-collection",
  );
  bindEventOnce(rescanCollectionButton, "command", () => {
    void runWithButtonDisabled(rescanCollectionButton, () =>
      CCFRankFactory.rescanCurrentCollection(),
    );
  });

  const rescanLibraryButton = doc.getElementById(
    "zotero-prefpane-__addonRef__-rescan-library",
  );
  bindEventOnce(rescanLibraryButton, "command", () => {
    void runWithButtonDisabled(rescanLibraryButton, () =>
      CCFRankFactory.rescanCurrentLibrary(),
    );
  });
}
