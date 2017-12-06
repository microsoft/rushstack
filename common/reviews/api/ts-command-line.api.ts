// @internal (undocumented)
interface _ICommandLineParserData {
  // (undocumented)
  [ key: string ]: any;
  // (undocumented)
  action: string;
}

// @public
class CommandLineAction extends CommandLineParameterProvider {
  constructor(options: ICommandLineActionOptions);
  // @internal
  public _buildParser(actionsSubParser: argparse.SubParser): void;
  // @internal
  public _execute(): void;
  // @internal
  public _processParsedData(data: ICommandLineParserData): void;
  protected abstract onExecute(): void;
  public options: ICommandLineActionOptions;
}

// @public
class CommandLineFlagParameter extends CommandLineParameter<boolean> {
}

// @public
class CommandLineIntegerParameter extends CommandLineParameter<number> {
}

// @public
class CommandLineOptionParameter extends CommandLineParameter<string> {
}

// @public
class CommandLineParameter<TValue> {
  constructor(key: string, converter?: (data: string) => TValue);
  // @internal
  public readonly _key: string;
  // @internal
  public _setValue(data: ICommandLineParserData): void;
  public readonly value: TValue;
}

// @public
class CommandLineParameterProvider {
  constructor();
  // @internal
  protected _argumentParser: argparse.ArgumentParser;
  // @internal (undocumented)
  protected _processParsedData(data: ICommandLineParserData): void;
  protected defineFlagParameter(definition: ICommandLineFlagDefinition): CommandLineFlagParameter;
  protected defineIntegerParameter(definition: ICommandLineIntegerDefinition): CommandLineIntegerParameter;
  protected defineOptionParameter(definition: ICommandLineOptionDefinition): CommandLineOptionParameter;
  protected defineStringListParameter(definition: ICommandLineStringListDefinition): CommandLineStringListParameter;
  protected defineStringParameter(definition: ICommandLineStringDefinition): CommandLineStringParameter;
  protected abstract onDefineParameters(): void;
  // (undocumented)
  protected validateParameters(): void;
}

// @public
class CommandLineParser extends CommandLineParameterProvider {
  constructor(options: ICommandListParserOptions);
  public addAction(command: CommandLineAction): void;
  public execute(args?: string[]): void;
  protected onExecute(): void;
  protected selectedAction: CommandLineAction;
}

// @public
class CommandLineStringListParameter extends CommandLineParameter<string[]> {
}

// @public
class CommandLineStringParameter extends CommandLineParameter<string> {
}

// @public
interface IBaseCommandLineDefinition<TValue> {
  defaultValue?: TValue | undefined;
  description: string;
  parameterLongName: string;
  parameterShortName?: string;
  required?: boolean;
}

// @public
interface ICommandLineActionOptions {
  actionVerb: string;
  documentation: string;
  summary: string;
}

// @public
interface ICommandLineFlagDefinition extends IBaseCommandLineDefinition<boolean> {
}

// @public
interface ICommandLineIntegerDefinition extends IKeyedCommandLineDefinition<number> {
}

// @public
interface ICommandLineOptionDefinition extends IBaseCommandLineDefinition<string> {
  options: string[];
}

// @public
interface ICommandLineStringDefinition extends IKeyedCommandLineDefinition<string> {
}

// @public
interface ICommandLineStringListDefinition extends IKeyedCommandLineDefinition<string[]> {
}

// @public
interface ICommandListParserOptions {
  toolDescription: string;
  toolFilename: string;
}

