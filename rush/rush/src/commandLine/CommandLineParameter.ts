
export interface ICommandLineFlagDefinition {
  parameterLongName: string;
  parameterShortName?: string;
  description: string;
}

export class CommandLineFlag {
  public key: string;
  public value: boolean;
}
