/**
 * @beta
 */
export enum Severity {
  log,
  warn,
  error
}

/**
 * @beta
 */
export interface ITerminalProvider {
  supportsColor: boolean;
  width: number | undefined;
  write(data: string, severity: Severity): void;
}
