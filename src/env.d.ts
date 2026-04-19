declare module "*.css?raw" {
  const content: string;
  export default content;
}

declare module "*.html?raw" {
  const content: string;
  export default content;
}

declare module "alpinejs" {
  type AlpineFactory = {
    data(name: string, callback: () => unknown): void;
    start(): void;
  };

  const Alpine: AlpineFactory;
  export default Alpine;
}

declare const __APP_VERSION__: string;
declare function GM_getValue<T>(key: string, defaultValue: T): T | Promise<T>;
declare function GM_setValue<T>(key: string, value: T): void | Promise<void>;
/// <reference types="vite-plugin-monkey/client" />