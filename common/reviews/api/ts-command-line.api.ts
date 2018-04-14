// @internal (undocumented)
interface _ICommandLineParserData {
  // (undocumented)
  [key: string]: any;
  // (undocumented)
  action: string;
}

// @public
class CommandLineAction extends CommandLineParameterProvider {
  constructor(options: ICommandLineActionOptions);
  // @internal
  _buildParser(actionsSubParser: argparse.SubParser): void;
  // @internal
  _execute(): Promise<void>;
  // @internal
  _processParsedData(data: ICommandLineParserData): void;
  protected abstract onDefineParameters(): void;
  protected abstract onExecute(): Promise<void>;
  options: ICommandLineActionOptions;
}

// @public
class CommandLineChoiceParameter extends CommandLineParameter<string> {
}

// @public
class CommandLineFlagParameter extends CommandLineParameter<boolean> {
}

// @public
class CommandLineIntegerParameter extends CommandLineParameter<number> {
}

// @public
class CommandLineParameter<T> {
  constructor(key: string, converter?: (data: string) => T);
  // @internal
  readonly _key: string;
  // @internal
  _setValue(data: ICommandLineParserData): void;
  readonly value: T;
}

// @public
class CommandLineParameterProvider {
  // @internal
  constructor();
  // @internal
  protected _argumentParser: argparse.ArgumentParser;
  // @internal (undocumented)
  protected _processParsedData(data: ICommandLineParserData): void;
  protected defineChoiceParameter(definition: ICommandLineChoiceDefinition): CommandLineChoiceParameter;
  protected defineFlagParameter(definition: ICommandLineFlagDefinition): CommandLineFlagParameter;
  protected defineIntegerParameter(definition: ICommandLineIntegerDefinition): CommandLineIntegerParameter;
  protected defineStringListParameter(definition: ICommandLineStringListDefinition): CommandLineStringListParameter;
  protected defineStringParameter(definition: ICommandLineStringDefinition): CommandLineStringParameter;
  protected abstract onDefineParameters(): void;
}

// @public
class CommandLineParser extends CommandLineParameterProvider {
  constructor(options: ICommandLineParserOptions);
  addAction(command: CommandLineAction): void;
  execute(args?: string[]): Promise<boolean>;
  executeWithoutErrorHandling(args?: string[]): Promise<void>;
  protected onExecute(): Promise<void>;
  selectedAction: CommandLineAction;
}

// @public
class CommandLineStringListParameter extends CommandLineParameter<string[]> {
}

// @public
class CommandLineStringParameter extends CommandLineParameter<string> {
}

// @public (undocumented)
class DynamicCommandLineAction extends CommandLineAction {
  // (undocumented)
  protected onDefineParameters(): void;
  // (undocumented)
  protected onExecute(): Promise<void>;
}

// @public (undocumented)
class DynamicCommandLineParser extends CommandLineParser {
  // (undocumented)
  protected onDefineParameters(): void;
}

// @public
interface IBaseCommandLineDefinition {
  description: string;
  parameterLongName: string;
  parameterShortName?: string;
}

// @public
interface ICommandLineActionOptions {
  actionVerb: string;
  documentation: string;
  summary: string;
}

// @public
interface ICommandLineChoiceDefinition extends IBaseCommandLineDefinition {
  defaultValue?: string;
  options: string[];
}

// @public
interface ICommandLineFlagDefinition extends IBaseCommandLineDefinition {
}

// @public
interface ICommandLineIntegerDefinition extends IKeyedCommandLineDefinition {
}

// @public
interface ICommandLineParserOptions {
  toolDescription: string;
  toolFilename: string;
}

// @public
interface ICommandLineStringDefinition extends IKeyedCommandLineDefinition {
}

// @public
interface ICommandLineStringListDefinition extends IKeyedCommandLineDefinition {
}

