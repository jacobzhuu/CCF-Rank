import { getConfidenceBand } from "./confidence";
import { getCCFSettings } from "./settings";
import { CCFRankResolver } from "./resolver";

type ColumnKey = "rank" | "category" | "abbr" | "source" | "confidence";

const COLUMN_META: Record<
  ColumnKey,
  { dataKey: string; label: string; emptyText: string }
> = {
  rank: {
    dataKey: "ccfRank",
    label: "CCF 等级",
    emptyText: "-",
  },
  category: {
    dataKey: "ccfCategory",
    label: "CCF 分类",
    emptyText: "-",
  },
  abbr: {
    dataKey: "ccfAbbr",
    label: "CCF 会议/期刊",
    emptyText: "-",
  },
  source: {
    dataKey: "ccfSource",
    label: "CCF 来源",
    emptyText: "-",
  },
  confidence: {
    dataKey: "ccfConfidence",
    label: "CCF 置信度",
    emptyText: "-",
  },
};

export class CCFColumnsManager {
  private registeredKeys = new Map<ColumnKey, string>();

  constructor(private resolver: CCFRankResolver) {}

  async syncColumns() {
    await this.ensureColumn("rank");
    await this.ensureColumn("category");
    await this.ensureColumn("source");
    await this.ensureColumn("confidence");

    if (getCCFSettings().showAbbrColumn) {
      await this.ensureColumn("abbr");
    } else {
      await this.unregisterColumn("abbr");
    }

    this.refreshAllTrees();
  }

  async unregisterAll() {
    for (const key of [
      "rank",
      "category",
      "abbr",
      "source",
      "confidence",
    ] as ColumnKey[]) {
      await this.unregisterColumn(key);
    }
  }

  refreshAllTrees() {
    Zotero.ItemTreeManager.refreshColumns();
    for (const win of Zotero.getMainWindows()) {
      const itemsView = win.ZoteroPane?.itemsView;
      if (itemsView) {
        (itemsView as any).refreshAndMaintainSelection();
      }
    }
  }

  private async ensureColumn(key: ColumnKey) {
    if (this.registeredKeys.has(key)) return;

    const result = await Zotero.ItemTreeManager.registerColumns({
      pluginID: addon.data.config.addonID,
      dataKey: COLUMN_META[key].dataKey,
      label: COLUMN_META[key].label,
      enabledTreeIDs: ["main"],
      zoteroPersist: ["width", "hidden", "sortDirection"],
      dataProvider: (item: Zotero.Item) => this.getColumnValue(item, key),
      renderCell: (_index, data, column, _isFirstColumn, doc) =>
        this.renderCell(doc, column.className, key, data),
    });

    if (result) {
      this.registeredKeys.set(key, String(result));
    }
  }

  private async unregisterColumn(key: ColumnKey) {
    const registeredKey = this.registeredKeys.get(key);
    if (!registeredKey) return;

    await Zotero.ItemTreeManager.unregisterColumns(registeredKey);
    this.registeredKeys.delete(key);
  }

  private getColumnValue(item: Zotero.Item, key: ColumnKey) {
    const resolved = this.resolver.resolveItem(item);
    if (!resolved) return "";

    switch (key) {
      case "rank":
        return resolved.rank;
      case "category":
        return resolved.category;
      case "abbr":
        return resolved.abbr;
      case "source":
        return this.formatSource(resolved.source);
      case "confidence":
        return getConfidenceBand(resolved.confidence);
    }
  }

  private formatSource(source: "manual" | "extra" | "computed") {
    switch (source) {
      case "manual":
        return "手动";
      case "extra":
        return "缓存";
      case "computed":
        return "实时";
    }
  }

  private renderCell(
    doc: Document,
    className: string,
    key: ColumnKey,
    data: string,
  ) {
    const span = doc.createElement("span");
    span.className = `cell ${className} ccf-cell ccf-cell--${key}`;

    if (data) {
      span.textContent = data;
      span.classList.add("is-populated");
      if (key === "rank") {
        span.classList.add(`ccf-rank--${data}`);
      }
    } else {
      span.textContent = COLUMN_META[key].emptyText;
      span.classList.add("is-empty");
    }

    return span;
  }
}
