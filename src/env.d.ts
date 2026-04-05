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
