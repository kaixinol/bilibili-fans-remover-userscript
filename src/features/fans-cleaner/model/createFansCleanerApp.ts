import {
  fetchFansPage,
  fetchFansPageWithAttribute,
  getWbiKeys,
  kickFan
} from "../../../services/bilibili/api";
import {
  APP_VERSION,
  DEFAULT_CONFIG,
  type FansCleanerConfig,
  setFansCleanerConfig
} from "../../../shared/config";
import type { FanItem, FanItemWithAttribute, ItemStatus, WbiKeys } from "../../../shared/types";
import { logInfo, normalizeError, randomBetween, sleep } from "../../../shared/utils";

type StatusMap = Record<string, ItemStatus>;

export interface FansCleanerContext {
  mid: string;
  csrf: string;
  isOwnSpace: boolean;
  config: FansCleanerConfig;
}

export interface FansCleanerApp {
  panelOpen: boolean;
  settingsOpen: boolean;
  loading: boolean;
  bulkLoading: boolean;
  removing: boolean;
  savingSettings: boolean;
  requiresRiskVerification: boolean;
  errorMessage: string;
  statusBar: string;
  currentPage: number;
  totalPages: number;
  totalFans: number;
  showingAllFans: boolean;
  fans: FanItem[];
  selectedFanIds: string[];
  removedFanIds: string[];
  nonMutualFanIds: string[];
  statuses: StatusMap;
  wbiKeys: WbiKeys | null;
  visibleStartIndex: number;
  visibleEndIndex: number;
  hasMoreFansToLoad: boolean;
  config: FansCleanerConfig;
  readonly actionsDisabled: boolean;
  readonly isBusy: boolean;
  readonly pageInfo: string;
  readonly visibleFans: FanItem[];
  readonly topSpacerHeight: number;
  readonly bottomSpacerHeight: number;
  togglePanel(): Promise<void>;
  closePanel(): void;
  toggleSettings(): void;
  saveSettings(): Promise<void>;
  resetSettings(): Promise<void>;
  refreshCurrentPage(): Promise<void>;
  loadFans(page?: number): Promise<void>;
  loadAllFans(): Promise<void>;
  loadAllFansLegacy(): Promise<void>;
  loadAllFansWithAttribute(): Promise<void>;
  loadNextFansPage(): Promise<void>;
  toggleSelectAll(): void;
  kickSelectedFans(): Promise<void>;
  kickNonMutualFans(): Promise<void>;
  handleListScroll(): Promise<void>;
  resetViewport(resetScroll?: boolean): void;
  isRemoved(mid: number): boolean;
  statusText(mid: number): string;
  statusToneClass(mid: number): string;
  statusTitle(mid: number): string;
}

const RISK_CONTROL_CODE = -352;
const LIST_CONTAINER_ID = "bk-list-scroll";
const VIRTUAL_ITEM_HEIGHT = 78;
const VIRTUAL_OVERSCAN = 10;
const LOAD_MORE_THRESHOLD_PX = 320;

const toFanId = (mid: number | string): string => String(mid);
const createEmptyStatusMap = (): StatusMap => ({});
const isRiskControlTriggered = (code: number): boolean => code === RISK_CONTROL_CODE;
const buildBulkLoadWarning = (
  totalFans: number,
  totalPages: number,
  bulkFetchDelayMinMs: number,
  bulkFetchDelayMaxMs: number
): string =>
  `警告：你有 ${totalFans} 个粉丝，需要连续请求 ${totalPages} 次。\n` +
  `连续高频请求很容易触发风控，程序会在每次请求间强制等待 ${(
    bulkFetchDelayMinMs / 1000
  ).toFixed(1)}~${(bulkFetchDelayMaxMs / 1000).toFixed(1)} 秒。\n\n是否继续加载全部？`;
const buildNonMutualWarning = (count: number, removeDelayMs: number): string =>
  `即将移除 ${count} 个非互粉粉丝。\n系统会先按节流策略逐个调用移除接口，间隔 ${(
    removeDelayMs / 1000
  ).toFixed(1)} 秒。\n\n确定继续吗？`;
const ownSpaceOnlyMessage = "仅支持当前登录用户自己的个人空间";
const getListContainer = (): HTMLElement | null =>
  document.getElementById(LIST_CONTAINER_ID);

export function createFansCleanerApp({
  mid,
  csrf,
  isOwnSpace,
  config
}: FansCleanerContext): FansCleanerApp {
  const updateVirtualWindow = (app: FansCleanerApp, resetScroll = false): void => {
    const container = getListContainer();
    const viewportHeight = container?.clientHeight ?? 560;

    if (resetScroll && container) {
      container.scrollTop = 0;
    }

    const scrollTop = container?.scrollTop ?? 0;
    const visibleCount = Math.max(
      1,
      Math.ceil(viewportHeight / VIRTUAL_ITEM_HEIGHT) + VIRTUAL_OVERSCAN * 2
    );
    const start = Math.max(0, Math.floor(scrollTop / VIRTUAL_ITEM_HEIGHT) - VIRTUAL_OVERSCAN);
    const end = Math.min(app.fans.length, start + visibleCount);

    app.visibleStartIndex = start;
    app.visibleEndIndex = end;
  };

  const replaceFans = (app: FansCleanerApp, nextFans: FanItem[], resetScroll = true): void => {
    app.fans = nextFans;
    updateVirtualWindow(app, resetScroll);
  };

  const appendFans = (app: FansCleanerApp, nextFans: FanItem[]): void => {
    app.fans = [...app.fans, ...nextFans];
    updateVirtualWindow(app);
  };

  const syncLocalStateAfterRemoval = (app: FansCleanerApp, removedIds: string[]): void => {
    if (removedIds.length === 0) {
      return;
    }

    const removedIdSet = new Set(removedIds);
    app.fans = app.fans.filter(({ mid: fanMid }) => !removedIdSet.has(toFanId(fanMid)));
    app.selectedFanIds = app.selectedFanIds.filter((fanId) => !removedIdSet.has(fanId));
    app.nonMutualFanIds = app.nonMutualFanIds.filter((fanId) => !removedIdSet.has(fanId));
    app.totalFans = Math.max(0, app.totalFans - removedIds.length);
    app.totalPages = Math.max(1, Math.ceil(app.totalFans / app.config.pageSize));
    app.hasMoreFansToLoad = !app.showingAllFans && app.currentPage < app.totalPages;
    updateVirtualWindow(app);
  };

  const removeFansByIds = async (app: FansCleanerApp, fanIds: string[]): Promise<void> => {
    app.removing = true;
    app.statusBar = "正在处理...";

    let successCount = 0;
    let failCount = 0;

    for (const [index, fanId] of fanIds.entries()) {
      app.statuses[fanId] = { text: "处理中...", tone: "pending" };

      try {
        const response = await kickFan(fanId, csrf);

        if (response.code === 0) {
          app.statuses[fanId] = { text: "已移除", tone: "success" };
          app.removedFanIds = app.removedFanIds.includes(fanId)
            ? app.removedFanIds
            : [...app.removedFanIds, fanId];
          successCount += 1;
        } else {
          app.statuses[fanId] = { text: "失败", tone: "error", title: response.message };
          failCount += 1;
        }
      } catch (error) {
        app.statuses[fanId] = { text: "错误", tone: "error", title: normalizeError(error) };
        failCount += 1;
      }

      app.statusBar = `进度: ${index + 1}/${fanIds.length}`;

      if (index < fanIds.length - 1) {
        await sleep(app.config.removeDelayMs);
      }
    }

    app.removing = false;
    syncLocalStateAfterRemoval(
      app,
      fanIds.filter((fanId) => app.statuses[fanId]?.tone === "success")
    );
    app.statusBar = `操作完成。成功 ${successCount}，失败 ${failCount}`;
    window.alert(`操作完成。成功: ${successCount}，失败: ${failCount}`);
  };

  return {
    panelOpen: false,
    settingsOpen: false,
    loading: false,
    bulkLoading: false,
    removing: false,
    savingSettings: false,
    requiresRiskVerification: false,
    errorMessage: "",
    statusBar: `就绪 v${APP_VERSION}`,
    currentPage: 1,
    totalPages: 1,
    totalFans: 0,
    showingAllFans: false,
    fans: [],
    selectedFanIds: [],
    removedFanIds: [],
    nonMutualFanIds: [],
    statuses: createEmptyStatusMap(),
    wbiKeys: null,
    visibleStartIndex: 0,
    visibleEndIndex: 0,
    hasMoreFansToLoad: true,
    config: { ...config },

    get actionsDisabled() {
      return !isOwnSpace;
    },

    get isBusy() {
      return this.loading || this.bulkLoading || this.removing;
    },

    get pageInfo() {
      if (!isOwnSpace) {
        return ownSpaceOnlyMessage;
      }

      return this.showingAllFans
        ? `已载入全部 ${this.fans.length} 人，滚动查看预览`
        : `已加载 ${this.fans.length}/${this.totalFans || 0} 人，滚动到底继续加载`;
    },

    get visibleFans() {
      return this.fans.slice(this.visibleStartIndex, this.visibleEndIndex);
    },

    get topSpacerHeight() {
      return this.visibleStartIndex * VIRTUAL_ITEM_HEIGHT;
    },

    get bottomSpacerHeight() {
      return Math.max(0, (this.fans.length - this.visibleEndIndex) * VIRTUAL_ITEM_HEIGHT);
    },

    async togglePanel() {
      this.panelOpen = !this.panelOpen;

      if (this.panelOpen && !isOwnSpace) {
        this.statusBar = ownSpaceOnlyMessage;
        return;
      }

      if (this.panelOpen && this.fans.length === 0 && !this.loading) {
        await this.loadFans(1);
      } else if (this.panelOpen) {
        this.resetViewport();
      }
    },

    closePanel() {
      this.panelOpen = false;
      this.settingsOpen = false;
    },

    toggleSettings() {
      this.settingsOpen = !this.settingsOpen;
    },

    async saveSettings() {
      this.savingSettings = true;

      try {
        const nextConfig = await setFansCleanerConfig(this.config);
        this.config = { ...nextConfig };
        this.statusBar = "设置已保存，后续请求将使用新配置";
        this.settingsOpen = false;
      } catch (error) {
        this.errorMessage = `设置保存失败: ${normalizeError(error)}`;
        this.statusBar = "设置保存失败";
      } finally {
        this.savingSettings = false;
      }
    },

    async resetSettings() {
      this.savingSettings = true;

      try {
        const nextConfig = await setFansCleanerConfig(DEFAULT_CONFIG);
        this.config = { ...nextConfig };
        this.statusBar = "设置已重置为默认值";
      } catch (error) {
        this.errorMessage = `设置重置失败: ${normalizeError(error)}`;
        this.statusBar = "设置重置失败";
      } finally {
        this.savingSettings = false;
      }
    },

    async refreshCurrentPage() {
      if (!isOwnSpace) {
        this.statusBar = ownSpaceOnlyMessage;
        return;
      }

      return this.loadFans(1);
    },

    async loadFans(page = 1) {
      if (!isOwnSpace) {
        this.statusBar = ownSpaceOnlyMessage;
        return;
      }

      this.loading = true;
      this.requiresRiskVerification = false;
      this.errorMessage = "";
      this.showingAllFans = false;
      this.hasMoreFansToLoad = true;
      this.statusBar = "读取中...";

      try {
        this.wbiKeys ??= await getWbiKeys();
        const response = await fetchFansPage(mid, page, this.wbiKeys, this.config.pageSize);

        if (isRiskControlTriggered(response.code)) {
          this.requiresRiskVerification = true;
          this.statusBar = "需要验证";
          replaceFans(this, []);
          return;
        }

        if (response.code !== 0) {
          this.errorMessage = `API 错误: ${response.message} (${response.code})`;
          this.statusBar = "请求失败";
          replaceFans(this, []);
          return;
        }

        this.currentPage = page;
        this.totalFans = response.data.total;
        this.totalPages = Math.max(1, Math.ceil(response.data.total / this.config.pageSize));
        this.hasMoreFansToLoad = this.currentPage < this.totalPages;
        replaceFans(this, response.data.list ?? []);
        this.selectedFanIds = [];
        this.nonMutualFanIds = [];
        this.statusBar = this.hasMoreFansToLoad
          ? `已加载 ${this.fans.length}/${this.totalFans} 粉丝，可继续下滑追加`
          : `已加载 ${this.totalFans} 粉丝`;
      } catch (error) {
        this.errorMessage = `请求失败: ${normalizeError(error)}`;
        this.statusBar = "请求失败";
      } finally {
        this.loading = false;
      }
    },

    async loadAllFans() {
      if (!isOwnSpace) {
        this.statusBar = ownSpaceOnlyMessage;
        return;
      }

      if (this.config.fansQueryMode === "attribute") {
        await this.loadAllFansWithAttribute();
      } else {
        await this.loadAllFansLegacy();
      }
    },

    async loadAllFansLegacy() {
      if (
        this.totalFans > this.config.pageSize &&
        !window.confirm(
          buildBulkLoadWarning(
            this.totalFans,
            this.totalPages,
            this.config.bulkFetchDelayMinMs,
            this.config.bulkFetchDelayMaxMs
          )
        )
      ) {
        return;
      }

      this.bulkLoading = true;
      this.requiresRiskVerification = false;
      this.errorMessage = "";
      this.statusBar = "起步中，准备全量抓取...";

      try {
        this.wbiKeys ??= await getWbiKeys();
        const firstPage = await fetchFansPage(mid, 1, this.wbiKeys, this.config.pageSize);

        if (isRiskControlTriggered(firstPage.code)) {
          this.requiresRiskVerification = true;
          this.statusBar = "需要验证";
          return;
        }

        if (firstPage.code !== 0) {
          this.errorMessage = `API 错误: ${firstPage.message} (${firstPage.code})`;
          this.statusBar = "请求失败";
          return;
        }

        const allFans = [...(firstPage.data.list ?? [])];
        const targetPages = Math.max(1, Math.ceil(firstPage.data.total / this.config.pageSize));
        let loadedPages = 1;
        let interruptedByRiskControl = false;
        let partialFailureMessage = "";
        this.totalFans = firstPage.data.total;
        this.totalPages = targetPages;

        for (const page of Array.from({ length: Math.max(0, targetPages - 1) }, (_, index) => index + 2)) {
          this.statusBar = `正在拉取第 ${page} 页...`;
          await sleep(
            randomBetween(this.config.bulkFetchDelayMinMs, this.config.bulkFetchDelayMaxMs)
          );

          const response = await fetchFansPage(mid, page, this.wbiKeys, this.config.pageSize);
          if (isRiskControlTriggered(response.code)) {
            interruptedByRiskControl = true;
            loadedPages = page - 1;
            this.requiresRiskVerification = true;
            this.errorMessage = `拉取第 ${page} 页时触发风控，当前只保留前 ${page - 1} 页缓存。`;
            window.alert(`拉取第 ${page} 页时触发了风控拦截，已保留前 ${page - 1} 页数据。`);
            break;
          }

          if (response.code !== 0) {
            loadedPages = page - 1;
            partialFailureMessage = `拉取第 ${page} 页失败: ${response.message} (${response.code})`;
            this.errorMessage = partialFailureMessage;
            break;
          }

          allFans.push(...(response.data.list ?? []));
          loadedPages = page;
        }

        this.currentPage = loadedPages;
        this.hasMoreFansToLoad = loadedPages < targetPages;
        this.showingAllFans = loadedPages >= targetPages;
        replaceFans(this, allFans, true);
        this.selectedFanIds = [];
        this.nonMutualFanIds = [];
        this.statusBar = interruptedByRiskControl
          ? `全量拉取被风控中断，已缓存 ${allFans.length}/${this.totalFans} 粉丝`
          : partialFailureMessage
            ? `全量拉取中断，已缓存 ${allFans.length}/${this.totalFans} 粉丝`
            : `全量获取完成，共缓存 ${allFans.length} 粉丝`;
      } catch (error) {
        this.errorMessage = `请求中断: ${normalizeError(error)}`;
        this.statusBar = "请求中断";
      } finally {
        this.bulkLoading = false;
      }
    },

    async loadAllFansWithAttribute() {
      if (
        this.totalFans > this.config.pageSize &&
        !window.confirm(
          buildBulkLoadWarning(
            this.totalFans,
            Math.ceil(this.totalFans / this.config.pageSize),
            this.config.bulkFetchDelayMinMs,
            this.config.bulkFetchDelayMaxMs
          )
        )
      ) {
        return;
      }

      this.bulkLoading = true;
      this.requiresRiskVerification = false;
      this.errorMessage = "";
      this.statusBar = "起步中，准备全量抓取（新接口）...";

      try {
        this.wbiKeys ??= await getWbiKeys();
        let offset: string | null = null;
        const allFans: FanItemWithAttribute[] = [];
        let requestCount = 0;
        let interruptedByRiskControl = false;
        let partialFailureMessage = "";

        while (true) {
          requestCount += 1;
          this.statusBar = `正在拉取第 ${requestCount} 批...`;

          const response = await fetchFansPageWithAttribute(
            mid,
            offset,
            this.wbiKeys,
            this.config.pageSize
          );

          if (isRiskControlTriggered(response.code)) {
            interruptedByRiskControl = true;
            this.requiresRiskVerification = true;
            this.errorMessage = `拉取第 ${requestCount} 批时触发风控，当前只保留前 ${allFans.length} 个粉丝。`;
            window.alert(`拉取第 ${requestCount} 批时触发了风控拦截，已保留前 ${allFans.length} 个粉丝数据。`);
            break;
          }

          if (response.code !== 0) {
            partialFailureMessage = `拉取第 ${requestCount} 批失败: ${response.message} (${response.code})`;
            this.errorMessage = partialFailureMessage;
            break;
          }

          const fansList = response.data.list ?? [];
          allFans.push(...fansList);

          if (requestCount === 1) {
            this.totalFans = response.data.total;
          }

          offset = response.data.offset || null;

          if (!offset || fansList.length < this.config.pageSize) {
            break;
          }

          if (requestCount < Math.ceil(this.totalFans / this.config.pageSize)) {
            await sleep(
              randomBetween(this.config.bulkFetchDelayMinMs, this.config.bulkFetchDelayMaxMs)
            );
          }
        }

        this.currentPage = requestCount;
        this.totalPages = Math.max(1, Math.ceil(this.totalFans / this.config.pageSize));
        this.hasMoreFansToLoad = false;
        this.showingAllFans = true;
        replaceFans(this, allFans, true);
        this.selectedFanIds = [];
        this.nonMutualFanIds = [];
        this.statusBar = interruptedByRiskControl
          ? `全量拉取被风控中断，已缓存 ${allFans.length}/${this.totalFans} 粉丝`
          : partialFailureMessage
            ? `全量拉取中断，已缓存 ${allFans.length}/${this.totalFans} 粉丝`
            : `全量获取完成，共缓存 ${allFans.length} 粉丝`;
      } catch (error) {
        this.errorMessage = `请求中断: ${normalizeError(error)}`;
        this.statusBar = "请求中断";
      } finally {
        this.bulkLoading = false;
      }
    },

    async loadNextFansPage() {
      if (!isOwnSpace) {
        this.statusBar = ownSpaceOnlyMessage;
        return;
      }

      if (this.showingAllFans || this.loading || this.bulkLoading || !this.hasMoreFansToLoad) {
        return;
      }

      const nextPage = this.currentPage + 1;
      if (nextPage > this.totalPages) {
        this.hasMoreFansToLoad = false;
        return;
      }

      this.loading = true;
      this.errorMessage = "";
      this.statusBar = `正在追加第 ${nextPage} 页...`;

      try {
        this.wbiKeys ??= await getWbiKeys();
        const response = await fetchFansPage(mid, nextPage, this.wbiKeys, this.config.pageSize);

        if (isRiskControlTriggered(response.code)) {
          this.requiresRiskVerification = true;
          this.statusBar = "需要验证";
          this.hasMoreFansToLoad = false;
          return;
        }

        if (response.code !== 0) {
          this.errorMessage = `API 错误: ${response.message} (${response.code})`;
          this.statusBar = "请求失败";
          this.hasMoreFansToLoad = false;
          return;
        }

        this.currentPage = nextPage;
        this.totalFans = response.data.total;
        this.totalPages = Math.max(1, Math.ceil(response.data.total / this.config.pageSize));
        this.hasMoreFansToLoad = this.currentPage < this.totalPages;
        appendFans(this, response.data.list ?? []);
        this.statusBar = this.hasMoreFansToLoad
          ? `已加载 ${this.fans.length}/${this.totalFans} 人，继续向下滚动可追加`
          : `已加载完全部 ${this.fans.length} 人`;
      } catch (error) {
        this.errorMessage = `请求失败: ${normalizeError(error)}`;
        this.statusBar = "请求失败";
        this.hasMoreFansToLoad = false;
      } finally {
        this.loading = false;
      }
    },

    toggleSelectAll() {
      if (!isOwnSpace) {
        this.statusBar = ownSpaceOnlyMessage;
        return;
      }

      const fanIds = this.fans.map(({ mid: fanMid }) => toFanId(fanMid));
      const allChecked = fanIds.length > 0 && fanIds.every((id) => this.selectedFanIds.includes(id));
      this.selectedFanIds = allChecked ? [] : fanIds;
    },

    async kickSelectedFans() {
      if (!isOwnSpace) {
        this.statusBar = ownSpaceOnlyMessage;
        return;
      }

      if (this.selectedFanIds.length === 0) {
        window.alert("请先勾选需要移除的粉丝。");
        return;
      }

      if (!window.confirm(`即将移除 ${this.selectedFanIds.length} 个粉丝，确定继续吗？`)) {
        return;
      }

      await removeFansByIds(this, [...this.selectedFanIds]);
    },

    async kickNonMutualFans() {
      if (!isOwnSpace) {
        this.statusBar = ownSpaceOnlyMessage;
        return;
      }

      // 加载全部粉丝列表（如果还没加载）
      if (!this.showingAllFans) {
        await this.loadAllFans();
      }

      if (this.requiresRiskVerification || this.errorMessage) {
        return;
      }

      this.statusBar = "正在筛选非互粉粉丝...";
      
      const fansWithAttribute = this.fans as FanItemWithAttribute[];
      const nonMutualFans = fansWithAttribute.filter((fan) => fan.attribute !== 6);
      const nonMutualFanIds = nonMutualFans.map(({ mid: fanMid }) => toFanId(fanMid));

      this.nonMutualFanIds = nonMutualFanIds;
      this.selectedFanIds = nonMutualFanIds;
      logInfo("将要被移除的非互粉用户列表", nonMutualFans);

      if (nonMutualFanIds.length === 0) {
        this.statusBar = "当前缓存中没有非互粉粉丝";
        window.alert("当前缓存中没有非互粉粉丝。");
        return;
      }

      this.statusBar = `即将移除 ${nonMutualFanIds.length} 个非互粉粉丝`;
      if (!window.confirm(buildNonMutualWarning(nonMutualFanIds.length, this.config.removeDelayMs))) {
        return;
      }

      await removeFansByIds(this, nonMutualFanIds);
    },

    async handleListScroll() {
      if (!isOwnSpace) {
        return;
      }

      this.resetViewport(false);

      const container = getListContainer();
      if (!container || this.showingAllFans) {
        return;
      }

      const distanceToBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;

      if (distanceToBottom <= LOAD_MORE_THRESHOLD_PX) {
        await this.loadNextFansPage();
      }
    },

    resetViewport(resetScroll = false) {
      updateVirtualWindow(this, resetScroll);
    },

    isRemoved(itemMid: number) {
      return this.removedFanIds.includes(toFanId(itemMid));
    },

    statusText(itemMid: number) {
      return this.statuses[toFanId(itemMid)]?.text ?? "";
    },

    statusToneClass(itemMid: number) {
      return this.statuses[toFanId(itemMid)]?.tone ?? "";
    },

    statusTitle(itemMid: number) {
      return this.statuses[toFanId(itemMid)]?.title ?? "";
    }
  };
}
