// @public
class CommandLineAction extends CommandLineParameterProvider {
  constructor(options: ICommandLineActionOptions);
  // (undocumented)
  public buildParser(actionsSubParser: argparse.SubParser): void;
  // (undocumented)
  public execute(): void;
  protected abstract onExecute(): void;
  // (undocumented)
  public options: ICommandLineActionOptions;
  // (undocumented)
  public processParsedData(data: ICommandLineParserData): void;
}

// @public (undocumented)
class CommandLineFlagParameter extends CommandLineParameter<boolean> {
}

// @public (undocumented)
class CommandLineIntegerParameter extends CommandLineParameter<number> {
}

// @public (undocumented)
class CommandLineOptionParameter extends CommandLineParameter<string> {
}

// @public (undocumented)
class CommandLineParameter<TValue> {
  constructor(key: string, converter?: (data: string) => TValue);
  // (undocumented)
  public readonly key: string;
  // (undocumented)
  public setValue(data: ICommandLineParserData): void;
  // (undocumented)
  public readonly value: TValue;
}

// @public
class CommandLineParameterProvider {
  constructor();
  // (undocumented)
  protected argumentParser: argparse.ArgumentParser;
  protected defineFlagParameter(options: ICommandLineFlagDefinition): CommandLineFlagParameter;
  protected defineIntegerParameter(definition: ICommandLineIntegerDefinition): CommandLineIntegerParameter;
  // (undocumented)
  protected defineOptionParameter(definition: ICommandLineOptionDefinition): CommandLineOptionParameter;
  protected defineStringListParameter(definition: ICommandLineStringListDefinition): CommandLineStringListParameter;
  protected defineStringParameter(definition: ICommandLineStringDefinition): CommandLineStringParameter;
  protected abstract onDefineParameters(): void;
  // (undocumented)
  protected processParsedData(data: ICommandLineParserData): void;
  // (undocumented)
  protected validateParameters(): boolean;
}

// @public
class CommandLineParser extends CommandLineParameterProvider {
  constructor(options: ICommandListParserOptions);
  public addAction(command: CommandLineAction): void;
  // (undocumented)
  protected chosenAction: CommandLineAction;
  public execute(args?: string[]): void;
  protected onExecute(): void;
}

// @public (undocumented)
class CommandLineStringListParameter extends CommandLineParameter<string[]> {
}

// @public (undocumented)
class CommandLineStringParameter extends CommandLineParameter<string> {
}

// @public
interface IBaseCommandLineDefinition<TValue> {
  description: string;
  getDefaultValue?: () => TValue | undefined;
  parameterLongName: string;
  parameterShortName?: string;
  required?: boolean;
}

// @public (undocumented)
interface ICommandLineActionOptions {
  actionVerb: string;
  documentation: string;
  summary: string;
}

// @public
interface ICommandLineFlagDefinition extends IBaseCommandLineDefinition<void> {
}

// @public
interface ICommandLineIntegerDefinition extends IKeyedCommandLineDefinition<number> {
}

// @public
interface ICommandLineOptionDefinition extends IBaseCommandLineDefinition<string> {
  options: string[];
}

// @public (undocumented)
interface ICommandLineParserData {
  // (undocumented)
  [ key: string ]: any;
  // (undocumented)
  action: string;
}

// @public
interface ICommandLineStringDefinition extends IKeyedCommandLineDefinition<string> {
}

// @public
interface ICommandLineStringListDefinition extends IKeyedCommandLineDefinition<string[]> {
}

// @public (undocumented)
interface ICommandListParserOptions {
  toolDescription: string;
  toolFilename: string;
}

// (No packageDescription for this package)
