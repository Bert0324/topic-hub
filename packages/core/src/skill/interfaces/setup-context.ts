export interface SetupContext {
  prompt(question: string, options?: { mask?: boolean }): Promise<string>;
  openBrowser(url: string): Promise<void>;
  storeSecret(key: string, value: string): Promise<void>;
  log(message: string): void;
  tenantId: string;
}
