export enum Severity {
  log,
  warn,
  error
}

export interface ITerminalProvider {
  supportsColor: boolean;
  width: number | undefined;
  write(data: string, severity: Severity): void;
}
