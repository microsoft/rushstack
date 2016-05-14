
export interface CommandLineFlagDefinition {
  parameterLongName: string,
  parameterShortName?: string,
  description: string
}

export class CommandLineFlag {
  key: string;
  value: boolean;
}
