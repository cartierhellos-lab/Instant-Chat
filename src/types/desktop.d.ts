export {};

declare global {
  interface Window {
    desktopBridge?: {
      isElectron: boolean;
      readClipboard: () => Promise<string>;
      writeClipboard: (text: string) => Promise<boolean>;
    };
  }
}
