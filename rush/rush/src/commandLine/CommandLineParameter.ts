export interface ICommandLineFlagDefinition {
  parameterLongName: string;
  parameterShortName?: string;
  description: string;
}

export class CommandLineFlagParameter {
  public key: string;
  public value: boolean;
}
