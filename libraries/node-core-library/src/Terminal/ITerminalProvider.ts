/**
 * @beta
 */
export enum Severity {
  log,
  warning,
  error,
  verbose
}

/**
 * @beta
 */
export interface ITerminalProvider {
  supportsColor: boolean;
  write(data: string, severity: Severity): void;
}
