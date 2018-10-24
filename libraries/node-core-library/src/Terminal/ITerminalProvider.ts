/**
 * @beta
 */
export enum TerminalProviderSeverity {
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
  write(data: string, severity: TerminalProviderSeverity): void;
}
