import Alpine from "alpinejs";

import { createFansCleanerApp } from "../features/fans-cleaner/model/createFansCleanerApp";
import panelTemplate from "../features/fans-cleaner/ui/panel.html?raw";
import styles from "../features/fans-cleaner/ui/styles.css?raw";
import { getCookie, injectStyle, parseMidFromLocation } from "../shared/utils";

const rootId = "bk-cleaner-root";

export function mountApp(): void {
  if (document.getElementById(rootId)) {
    return;
  }

  const mid = parseMidFromLocation(window.location.href);
  const csrf = getCookie("bili_jct");

  if (!mid || !csrf) {
    console.log("[Bilibili Fans Cleaner] 未检测到登录状态或不在个人空间");
    return;
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

  Alpine.data("fansCleanerApp", () => createFansCleanerApp({ mid, csrf }));
  (window as typeof window & { Alpine?: typeof Alpine }).Alpine = Alpine;
  Alpine.start();
}
