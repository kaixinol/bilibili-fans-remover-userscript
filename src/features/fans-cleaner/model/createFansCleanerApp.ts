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
import { normalizeError, randomBetween, sleep } from "../../../shared/utils";

type StatusMap = Record<string, ItemStatus>;

export interface FansCleanerContext {
  mid: string;
  csrf: string;
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
  readonly isBusy: boolean;
  readonly pageInfo: string;
  togglePanel(): Promise<void>;
  closePanel(): void;
  refreshCurrentPage(): Promise<void>;
  loadFans(page?: number): Promise<void>;
  loadAllFans(): Promise<void>;
  loadAllFollowings(): Promise<Set<string> | null>;
  toggleSelectAll(): void;
  prevPage(): Promise<void>;
  nextPage(): Promise<void>;
  kickSelectedFans(): Promise<void>;
  kickNonMutualFans(): Promise<void>;
  isRemoved(mid: number): boolean;
  statusText(mid: number): string;
  statusToneClass(mid: number): string;
  statusTitle(mid: number): string;
}

const RISK_CONTROL_CODE = -352;

const toFanId = (mid: number | string): string => String(mid);
const createEmptyStatusMap = (): StatusMap => ({});
const isRiskControlTriggered = (code: number): boolean => code === RISK_CONTROL_CODE;
const buildBulkLoadWarning = (totalFans: number, totalPages: number): string =>
  `警告：你有 ${totalFans} 个粉丝，需要连续请求 ${totalPages} 次。\n` +
  "连续高频请求很容易触发风控，程序会在每次请求间强制等待 1~1.5 秒。\n\n是否继续加载全部？";
const buildNonMutualWarning = (count: number): string =>
  `即将移除 ${count} 个非互粉粉丝。\n系统会先按节流策略逐个调用移除接口。\n\n确定继续吗？`;

export function createFansCleanerApp({
  mid,
  csrf
}: FansCleanerContext): FansCleanerApp {
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
    await app.loadFans(app.currentPage);
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

    get isBusy() {
      return this.loading || this.bulkLoading || this.loadingFollowings || this.removing;
    },

    get pageInfo() {
      return this.showingAllFans
        ? `已显示全部数据，共 ${this.fans.length} 人`
        : `第 ${this.currentPage} 页 / 共 ${this.totalPages} 页`;
    },

    async togglePanel() {
      this.panelOpen = !this.panelOpen;

      if (this.panelOpen && this.fans.length === 0 && !this.loading) {
        await this.loadFans(1);
      }
    },

    closePanel() {
      this.panelOpen = false;
    },

    async refreshCurrentPage() {
      return this.loadFans(this.currentPage);
    },

    async loadFans(page = 1) {
      this.loading = true;
      this.requiresRiskVerification = false;
      this.errorMessage = "";
      this.showingAllFans = false;
      this.statusBar = "读取中...";

      try {
        this.wbiKeys ??= await getWbiKeys();
        const response = await fetchFansPage(mid, page, this.wbiKeys);

        if (isRiskControlTriggered(response.code)) {
          this.requiresRiskVerification = true;
          this.statusBar = "需要验证";
          this.fans = [];
          return;
        }

        if (response.code !== 0) {
          this.errorMessage = `API 错误: ${response.message} (${response.code})`;
          this.statusBar = "请求失败";
          this.fans = [];
          return;
        }

        this.currentPage = page;
        this.totalFans = response.data.total;
        this.totalPages = Math.max(1, Math.ceil(response.data.total / PAGE_SIZE));
        this.fans = response.data.list ?? [];
        this.selectedFanIds = [];
        this.nonMutualFanIds = [];
        this.statusBar = `获取本页成功，共 ${this.totalFans} 粉丝`;
      } catch (error) {
        this.errorMessage = `请求失败: ${normalizeError(error)}`;
        this.statusBar = "请求失败";
      } finally {
        this.loading = false;
      }
    },

    async loadAllFans() {
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

        this.fans = allFans;
        this.currentPage = 1;
        this.totalPages = 1;
        this.showingAllFans = true;
        this.selectedFanIds = [];
        this.nonMutualFanIds = [];
        this.statusBar = `全量获取完成，共展示 ${allFans.length} 粉丝`;
      } catch (error) {
        this.errorMessage = `请求中断: ${normalizeError(error)}`;
        this.statusBar = "请求中断";
      } finally {
        this.bulkLoading = false;
      }
    },

    async loadAllFollowings() {
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

    toggleSelectAll() {
      const fanIds = this.fans.map(({ mid: fanMid }) => toFanId(fanMid));
      const allChecked = fanIds.length > 0 && fanIds.every((id) => this.selectedFanIds.includes(id));
      this.selectedFanIds = allChecked ? [] : fanIds;
    },

    async prevPage() {
      if (this.currentPage > 1) {
        return this.loadFans(this.currentPage - 1);
      }
    },

    async nextPage() {
      if (this.currentPage < this.totalPages) {
        return this.loadFans(this.currentPage + 1);
      }
    },

    async kickSelectedFans() {
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
      const nonMutualFanIds = this.fans
        .map(({ mid: fanMid }) => toFanId(fanMid))
        .filter((fanId) => !followingMidSet.has(fanId));

      this.nonMutualFanIds = nonMutualFanIds;
      this.selectedFanIds = nonMutualFanIds;

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
