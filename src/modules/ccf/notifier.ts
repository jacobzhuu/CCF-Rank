import { CCF_INTERNAL_NOTIFIER_KEY } from "./cache";
import { safeLog } from "./logging";
import { CCFRankResolver } from "./resolver";
import { getCCFSettings } from "./settings";

export class CCFNotifier {
  private notifierID: string | null = null;
  private pendingIDs = new Set<number>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private resolver: CCFRankResolver,
    private onFinished: () => void,
  ) {}

  register() {
    if (this.notifierID) return;

    const callback = {
      notify: (
        event: string,
        type: string,
        ids: Array<string | number>,
        extraData: Record<string, any>,
      ) => {
        if (type !== "item") return;
        if (!["add", "modify"].includes(event)) return;
        if (!getCCFSettings().autoLookupEnabled) return;

        const filteredIDs = this.filterInternalWrites(ids, extraData);
        if (filteredIDs.length === 0) return;

        this.schedule(filteredIDs);
      },
    };

    this.notifierID = Zotero.Notifier.registerObserver(callback, ["item"]);
    safeLog("[CCF] Notifier registered");
  }

  unregister() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.notifierID) return;
    Zotero.Notifier.unregisterObserver(this.notifierID);
    this.notifierID = null;
  }

  private schedule(ids: Array<string | number>) {
    ids.forEach((id) => {
      const parsed = typeof id === "number" ? id : Number(id);
      if (Number.isFinite(parsed)) {
        this.pendingIDs.add(parsed);
      }
    });

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      void this.flush();
    }, 1500);
  }

  private async flush() {
    const ids = Array.from(this.pendingIDs);
    this.pendingIDs.clear();
    this.timer = null;

    if (ids.length === 0) return;

    this.resolver.invalidateItems(ids);
    const items = Zotero.Items.get(ids).filter((item: Zotero.Item) =>
      item.isRegularItem(),
    );
    if (items.length === 0) return;

    await this.resolver.refreshItems(items);
    this.onFinished();
    safeLog(`[CCF] Auto-lookup completed for ${items.length} items`);
  }

  private filterInternalWrites(
    ids: Array<string | number>,
    extraData: Record<string, any> | undefined,
  ) {
    return ids.filter((id) => !this.isInternalWrite(id, extraData));
  }

  private isInternalWrite(
    id: string | number,
    extraData: Record<string, any> | undefined,
  ) {
    if (!extraData) return false;

    const itemData =
      extraData[id] ||
      extraData[String(id)] ||
      extraData.items?.[id] ||
      extraData.items?.[String(id)];

    return Boolean(
      itemData?.[CCF_INTERNAL_NOTIFIER_KEY] ||
      itemData?.notifierData?.[CCF_INTERNAL_NOTIFIER_KEY] ||
      extraData[CCF_INTERNAL_NOTIFIER_KEY] ||
      extraData.notifierData?.[CCF_INTERNAL_NOTIFIER_KEY],
    );
  }
}
