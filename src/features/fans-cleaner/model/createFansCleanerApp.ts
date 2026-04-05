import {
  fetchFansPage,
  getWbiKeys,
  kickFan,
  loadAllFollowings as loadAllFollowingsSet
} from "../../../services/bilibili/api";
import {
  APP_VERSION,
  BULK_FETCH_DELAY_MAX_MS,
  BULK_FETCH_DELAY_MIN_MS,
  PAGE_SIZE,
  REMOVE_DELAY_MS
} from "../../../shared/config";
import type { FanItem, ItemStatus, WbiKeys } from "../../../shared/types";
import { logInfo, normalizeError, randomBetween, sleep } from "../../../shared/utils";

type StatusMap = Record<string, ItemStatus>;

export interface FansCleanerContext {
  mid: string;
  csrf: string;
  isOwnSpace: boolean;
}

export interface FansCleanerApp {
  panelOpen: boolean;
  loading: boolean;
  bulkLoading: boolean;
  loadingFollowings: boolean;
  removing: boolean;
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
  followingMidSet: Set<string> | null;
  visibleStartIndex: number;
  visibleEndIndex: number;
  hasMoreFansToLoad: boolean;
  readonly actionsDisabled: boolean;
  readonly isBusy: boolean;
  readonly pageInfo: string;
  readonly visibleFans: FanItem[];
  readonly topSpacerHeight: number;
  readonly bottomSpacerHeight: number;
  togglePanel(): Promise<void>;
  closePanel(): void;
  refreshCurrentPage(): Promise<void>;
  loadFans(page?: number): Promise<void>;
  loadAllFans(): Promise<void>;
  loadAllFollowings(): Promise<Set<string> | null>;
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
const buildBulkLoadWarning = (totalFans: number, totalPages: number): string =>
  `警告：你有 ${totalFans} 个粉丝，需要连续请求 ${totalPages} 次。\n` +
  "连续高频请求很容易触发风控，程序会在每次请求间强制等待 1~1.5 秒。\n\n是否继续加载全部？";
const buildNonMutualWarning = (count: number): string =>
  `即将移除 ${count} 个非互粉粉丝。\n系统会先按节流策略逐个调用移除接口。\n\n确定继续吗？`;
const ownSpaceOnlyMessage = "仅支持当前登录用户自己的个人空间";
const getListContainer = (): HTMLElement | null =>
  document.getElementById(LIST_CONTAINER_ID);

export function createFansCleanerApp({
  mid,
  csrf,
  isOwnSpace
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
        await sleep(REMOVE_DELAY_MS);
      }
    }

    app.removing = false;
    window.alert(`操作完成。成功: ${successCount}，失败: ${failCount}`);
    await app.loadFans(1);
  };

  return {
    panelOpen: false,
    loading: false,
    bulkLoading: false,
    loadingFollowings: false,
    removing: false,
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
    followingMidSet: null,
    visibleStartIndex: 0,
    visibleEndIndex: 0,
    hasMoreFansToLoad: true,

    get actionsDisabled() {
      return !isOwnSpace;
    },

    get isBusy() {
      return this.loading || this.bulkLoading || this.loadingFollowings || this.removing;
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
        const response = await fetchFansPage(mid, page, this.wbiKeys);

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
        this.totalPages = Math.max(1, Math.ceil(response.data.total / PAGE_SIZE));
        this.hasMoreFansToLoad = this.currentPage < this.totalPages;
        replaceFans(this, response.data.list ?? []);
        this.selectedFanIds = [];
        this.nonMutualFanIds = [];
        this.statusBar = `已加载第 1 页，共 ${this.totalFans} 粉丝`;
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

      if (this.totalFans > PAGE_SIZE && !window.confirm(buildBulkLoadWarning(this.totalFans, this.totalPages))) {
        return;
      }

      this.bulkLoading = true;
      this.requiresRiskVerification = false;
      this.errorMessage = "";
      this.statusBar = "起步中，准备全量抓取...";

      try {
        this.wbiKeys ??= await getWbiKeys();
        const firstPage = await fetchFansPage(mid, 1, this.wbiKeys);

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
        const targetPages = Math.max(1, Math.ceil(firstPage.data.total / PAGE_SIZE));
        this.totalFans = firstPage.data.total;
        this.totalPages = targetPages;

        for (const page of Array.from({ length: Math.max(0, targetPages - 1) }, (_, index) => index + 2)) {
          this.statusBar = `正在拉取第 ${page} 页...`;
          await sleep(randomBetween(BULK_FETCH_DELAY_MIN_MS, BULK_FETCH_DELAY_MAX_MS));

          const response = await fetchFansPage(mid, page, this.wbiKeys);
          if (isRiskControlTriggered(response.code)) {
            window.alert(`拉取第 ${page} 页时触发了风控拦截，已保留前 ${page - 1} 页数据。`);
            break;
          }

          if (response.code !== 0) {
            break;
          }

          allFans.push(...(response.data.list ?? []));
        }

        this.currentPage = targetPages;
        this.hasMoreFansToLoad = false;
        this.showingAllFans = true;
        replaceFans(this, allFans, true);
        this.selectedFanIds = [];
        this.nonMutualFanIds = [];
        this.statusBar = `全量获取完成，共缓存 ${allFans.length} 粉丝`;
      } catch (error) {
        this.errorMessage = `请求中断: ${normalizeError(error)}`;
        this.statusBar = "请求中断";
      } finally {
        this.bulkLoading = false;
      }
    },

    async loadAllFollowings() {
      if (!isOwnSpace) {
        this.statusBar = ownSpaceOnlyMessage;
        return null;
      }

      if (this.followingMidSet && this.followingMidSet.size > 0) {
        logInfo("复用关注集合缓存", {
          size: this.followingMidSet.size
        });
        this.statusBar = `已复用关注缓存，共 ${this.followingMidSet.size} 人`;
        return this.followingMidSet;
      }

      this.loadingFollowings = true;
      this.requiresRiskVerification = false;
      this.errorMessage = "";
      this.statusBar = "正在拉取全部关注...";

      try {
        this.wbiKeys ??= await getWbiKeys();
        const response = await loadAllFollowingsSet(mid, this.wbiKeys, async (page, totalPages) => {
          this.statusBar = `正在拉取全部关注... ${page}/${totalPages}`;
          await sleep(randomBetween(BULK_FETCH_DELAY_MIN_MS, BULK_FETCH_DELAY_MAX_MS));
        });

        if (isRiskControlTriggered(response.code)) {
          this.requiresRiskVerification = true;
          this.statusBar = "需要验证";
          return null;
        }

        if (response.code !== 0) {
          this.errorMessage = `关注列表获取失败: ${response.message} (${response.code})`;
          this.statusBar = "请求失败";
          return null;
        }

        this.followingMidSet = response.data;
        this.statusBar = `关注列表获取完成，共 ${response.data.size} 人`;
        return response.data;
      } catch (error) {
        this.errorMessage = `关注列表获取失败: ${normalizeError(error)}`;
        this.statusBar = "请求失败";
        return null;
      } finally {
        this.loadingFollowings = false;
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
        const response = await fetchFansPage(mid, nextPage, this.wbiKeys);

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
        this.totalPages = Math.max(1, Math.ceil(response.data.total / PAGE_SIZE));
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

      if (!this.showingAllFans) {
        await this.loadAllFans();
      }

      if (this.requiresRiskVerification || this.errorMessage) {
        return;
      }

      const followingMidSet = await this.loadAllFollowings();
      if (!followingMidSet) {
        return;
      }

      this.statusBar = "正在比对互粉...";
      const nonMutualFans = this.fans.filter(({ mid: fanMid }) => !followingMidSet.has(toFanId(fanMid)));
      const nonMutualFanIds = this.fans
        .map(({ mid: fanMid }) => toFanId(fanMid))
        .filter((fanId) => !followingMidSet.has(fanId));

      this.nonMutualFanIds = nonMutualFanIds;
      this.selectedFanIds = nonMutualFanIds;
      logInfo("将要被移除的非互粉用户列表", nonMutualFans);

      if (nonMutualFanIds.length === 0) {
        this.statusBar = "当前缓存中没有非互粉粉丝";
        window.alert("当前缓存中没有非互粉粉丝。");
        return;
      }

      this.statusBar = `即将移除 ${nonMutualFanIds.length} 个非互粉粉丝`;
      if (!window.confirm(buildNonMutualWarning(nonMutualFanIds.length))) {
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
