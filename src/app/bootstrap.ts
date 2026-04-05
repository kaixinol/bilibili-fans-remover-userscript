import Alpine from "alpinejs";

import { getNavData } from "../services/bilibili/api";
import { createFansCleanerApp } from "../features/fans-cleaner/model/createFansCleanerApp";
import panelTemplate from "../features/fans-cleaner/ui/panel.html?raw";
import styles from "../features/fans-cleaner/ui/styles.css?raw";
import { getCookie, injectStyle, logInfo, parseMidFromLocation } from "../shared/utils";

const rootId = "bk-cleaner-root";

export async function mountApp(): Promise<void> {
  if (document.getElementById(rootId)) {
    return;
  }

  const mid = parseMidFromLocation(window.location.href);
  const csrf = getCookie("bili_jct");

  if (!mid || !csrf) {
    logInfo("未检测到登录状态或不在个人空间");
    return;
  }

  let isOwnSpace = false;
  try {
    const navData = await getNavData();
    isOwnSpace = String(navData.mid) === mid;
    logInfo("空间归属判断", {
      pageMid: mid,
      loginMid: String(navData.mid),
      isOwnSpace
    });
  } catch (error) {
    logInfo("获取登录用户信息失败，默认按非本人空间处理", error);
  }

  injectStyle(styles);

  const root = document.createElement("div");
  root.innerHTML = panelTemplate;

  const appRoot = root.firstElementChild;
  if (!appRoot) {
    return;
  }

  appRoot.setAttribute("x-data", "fansCleanerApp");
  document.body.appendChild(appRoot);

  Alpine.data("fansCleanerApp", () => createFansCleanerApp({ mid, csrf, isOwnSpace }));
  (window as typeof window & { Alpine?: typeof Alpine }).Alpine = Alpine;
  Alpine.start();
}
