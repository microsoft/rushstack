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
  eolCharacter: string;
  write(data: string, severity: TerminalProviderSeverity): void;
}
