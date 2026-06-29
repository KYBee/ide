export {};

declare global {
  interface Window {
    sessionControl?: {
      platform: string;
      versions: {
        chrome: string;
        electron: string;
        node: string;
      };
      selectDirectory?: (currentPath?: string) => Promise<string | null>;
    };
  }
}
