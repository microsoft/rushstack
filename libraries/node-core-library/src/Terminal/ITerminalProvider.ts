export enum Severity {
  log,
  warn,
  error
}

export interface ITerminalProvider {
  write(data: string, severity: Severity);
  supportsColor: boolean;
  width: number;
}
