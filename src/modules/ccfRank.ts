import { CCFColumnsManager } from "./ccf/columns";
import { getConfidenceBand } from "./ccf/confidence";
import { CCFRankMatcher } from "./ccf/matcher";
import { ManualCCFRankStore } from "./ccf/manualOverrideStore";
import { CCFNotifier } from "./ccf/notifier";
import { CCFRankResolver } from "./ccf/resolver";
import { getCCFSettings } from "./ccf/settings";
import { safeLog } from "./ccf/logging";
import type {
  CCFMatchField,
  CCFMatchStrategy,
  CCFRank,
  CCFResolvedSource,
} from "./ccf/types";

const matcher = new CCFRankMatcher();
const manualStore = new ManualCCFRankStore();
const resolver = new CCFRankResolver(matcher, manualStore);
const columnsManager = new CCFColumnsManager(resolver);
const notifier = new CCFNotifier(resolver, () =>
  columnsManager.refreshAllTrees(),
);

function getPluginIcon() {
  return `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`;
}

function getSelectedRegularItems() {
  return (
    Zotero.getActiveZoteroPane()
      ?.getSelectedItems()
      .filter((item) => item.isRegularItem()) || []
  );
}

function formatSource(source: CCFResolvedSource) {
  switch (source) {
    case "manual":
      return "手动设置";
    case "extra":
      return "Extra 缓存";
    case "computed":
      return "实时匹配";
  }
}

function formatStrategy(strategy?: CCFMatchStrategy) {
  switch (strategy) {
    case "custom-alias":
      return "自定义别名";
    case "extracted-abbr":
      return "标题/文本中提取简称";
    case "abbr-exact":
      return "简称精确命中";
    case "leading-token":
      return "前导简称命中";
    case "full-name-exact":
      return "全称精确命中";
    case "fuzzy":
      return "模糊匹配";
    default:
      return "-";
  }
}

function formatField(field?: CCFMatchField) {
  switch (field) {
    case "proceedingsTitle":
      return "proceedingsTitle";
    case "publicationTitle":
      return "publicationTitle";
    case "conferenceName":
      return "conferenceName";
    case "title":
      return "title";
    default:
      return "-";
  }
}

async function runRescan(scopeLabel: string, items: Zotero.Item[]) {
  const regularItems = items.filter((item) => item?.isRegularItem());
  if (regularItems.length === 0) {
    safeLog(`[CCF] No regular items to rescan for ${scopeLabel}`);
    return;
  }

  resolver.invalidateItems(regularItems.map((item) => item.id));

  const progress = new Zotero.ProgressWindow({ closeOnClick: true });
  progress.changeHeadline("CCF 重新扫描", getPluginIcon(), scopeLabel);
  progress.addDescription(`共 ${regularItems.length} 条文献`);
  progress.show();

  const changed = await resolver.refreshItems(regularItems);
  columnsManager.refreshAllTrees();

  progress.addLines(
    `${scopeLabel} 已完成，处理 ${regularItems.length} 条文献，更新 ${changed} 条缓存`,
    getPluginIcon(),
  );
  progress.startCloseTimer(2500);
}

export class CCFRankFactory {
  static async registerCCFColumn() {
    await columnsManager.syncColumns();
  }

  static async unregisterColumns() {
    await columnsManager.unregisterAll();
  }

  static registerRightClickMenu(toolkit: ZToolkit) {
    (toolkit as any).Menu.register("item", {
      tag: "menu",
      label: "设置 CCF 等级",
      children: [
        {
          tag: "menuitem",
          label: "A",
          commandListener: () => {
            void this.setManualRank("A");
          },
        },
        {
          tag: "menuitem",
          label: "B",
          commandListener: () => {
            void this.setManualRank("B");
          },
        },
        {
          tag: "menuitem",
          label: "C",
          commandListener: () => {
            void this.setManualRank("C");
          },
        },
        {
          tag: "menuseparator",
        },
        {
          tag: "menuitem",
          label: "清除手动设置",
          commandListener: () => {
            void this.clearManualRank();
          },
        },
        {
          tag: "menuitem",
          label: "忽略此条目（不显示等级）",
          commandListener: () => {
            void this.ignoreItems();
          },
        },
        {
          tag: "menuseparator",
        },
        {
          tag: "menuitem",
          label: "重新扫描选中条目",
          commandListener: () => {
            void this.rescanSelectedItems();
          },
        },
        {
          tag: "menuitem",
          label: "查看匹配详情",
          commandListener: () => {
            this.showMatchDetails();
          },
        },
      ],
    });
  }

  static async setManualRank(rank: CCFRank) {
    const items = getSelectedRegularItems();
    if (items.length === 0) {
      safeLog("[CCF Manual] No items selected");
      return;
    }

    manualStore.setRanks(
      items.map((item) => item.id),
      rank,
    );
    resolver.invalidateItems(items.map((item) => item.id));
    await resolver.refreshItems(items);
    columnsManager.refreshAllTrees();
  }

  static async clearManualRank() {
    const items = getSelectedRegularItems();
    if (items.length === 0) {
      safeLog("[CCF Manual] No items selected");
      return;
    }

    manualStore.clearRanks(items.map((item) => item.id));
    resolver.invalidateItems(items.map((item) => item.id));
    await resolver.refreshItems(items);
    columnsManager.refreshAllTrees();
  }

  static async ignoreItems() {
    const items = getSelectedRegularItems();
    if (items.length === 0) {
      safeLog("[CCF Manual] No items selected");
      return;
    }

    manualStore.ignoreItems(items.map((item) => item.id));
    resolver.invalidateItems(items.map((item) => item.id));
    await resolver.refreshItems(items);
    columnsManager.refreshAllTrees();
  }

  static registerNotifier() {
    notifier.register();
  }

  static unregisterNotifier() {
    notifier.unregister();
  }

  static async rescanSelectedItems() {
    await runRescan("选中条目", getSelectedRegularItems());
  }

  static async rescanCurrentCollection() {
    const pane = Zotero.getActiveZoteroPane();
    const collection = pane?.getSelectedCollection();
    if (!collection) {
      safeLog("[CCF] No collection selected");
      return;
    }

    await runRescan(`当前集合：${collection.name}`, collection.getChildItems());
  }

  static async rescanCurrentLibrary() {
    const pane = Zotero.getActiveZoteroPane();
    const libraryID = pane?.getSelectedLibraryID();
    if (!libraryID) {
      safeLog("[CCF] No library selected");
      return;
    }

    const search = new Zotero.Search({ libraryID });
    search.addCondition("deleted", "false");
    const ids = await search.search();
    const items = Zotero.Items.get(ids).filter((item: Zotero.Item) =>
      item.isRegularItem(),
    );
    await runRescan("当前库", items);
  }

  static showMatchDetails() {
    const item = getSelectedRegularItems()[0];
    if (!item) {
      safeLog("[CCF] No item selected for detail view");
      return;
    }

    const displayed = resolver.resolveItem(item);
    const explained =
      displayed && displayed.source !== "computed"
        ? resolver.resolveItem(item, {
            forceRefresh: true,
            preferExtra: false,
          })
        : displayed;
    const detailSource = explained || displayed;
    const message = displayed
      ? [
          `标题：${String(item.getField("title") || "(无标题)")}`,
          `等级：${displayed.rank}`,
          `分类：${displayed.category || "-"}`,
          `简称：${displayed.abbr || "-"}`,
          `来源：${formatSource(displayed.source)}`,
          `置信度：${getConfidenceBand(displayed.confidence)}`,
          `策略：${
            displayed.source === "manual"
              ? detailSource?.strategy
                ? `手动覆盖（原自动匹配：${formatStrategy(detailSource.strategy)}）`
                : "手动覆盖"
              : formatStrategy(detailSource?.strategy)
          }`,
          `命中字段：${formatField(detailSource?.matchedField)}`,
          `命中文本：${detailSource?.matchedValue || "-"}`,
          `使用别名：${detailSource?.matchedAlias || "-"}`,
        ].join("\n")
      : [
          `标题：${String(item.getField("title") || "(无标题)")}`,
          "当前未命中任何 CCF 条目。",
          `proceedingsTitle：${String(item.getField("proceedingsTitle") || "-")}`,
          `publicationTitle：${String(item.getField("publicationTitle") || "-")}`,
          `conferenceName：${String(item.getField("conferenceName") || "-")}`,
          "建议：补充 venue 字段，或在设置页添加自定义别名规则。",
        ].join("\n");

    Services.prompt.alert(
      Zotero.getMainWindow() as unknown as mozIDOMWindowProxy,
      "CCF 匹配详情",
      message,
    );
  }

  static async onSettingsChanged(options: { syncColumns?: boolean } = {}) {
    matcher.clearMemoCache();
    resolver.clearSessionCache();

    if (options.syncColumns) {
      await columnsManager.syncColumns();
      return;
    }

    if (!getCCFSettings().writeCacheToExtra) {
      columnsManager.refreshAllTrees();
      return;
    }

    columnsManager.refreshAllTrees();
  }
}
