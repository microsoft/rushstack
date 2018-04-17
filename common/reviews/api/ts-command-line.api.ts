// @internal
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
  protected _getArgumentParser(): argparse.ArgumentParser;
  // @internal
  _processParsedData(data: ICommandLineParserData): void;
  protected abstract onDefineParameters(): void;
  protected abstract onExecute(): Promise<void>;
  options: ICommandLineActionOptions;
}

// @public
class CommandLineChoiceParameter extends CommandLineParameter<string> {
  // @internal
  constructor(definition: ICommandLineChoiceDefinition);
  readonly alternatives: ReadonlyArray<string>;
  readonly defaultValue: string | undefined;
  readonly kind: CommandLineParameterKind;
}

// @public
class CommandLineFlagParameter extends CommandLineParameter<boolean> {
  // @internal
  constructor(definition: ICommandLineFlagDefinition);
  readonly kind: CommandLineParameterKind;
}

// @public
class CommandLineIntegerParameter extends CommandLineParameterWithArgument<number> {
  // @internal
  constructor(definition: ICommandLineIntegerDefinition);
  readonly kind: CommandLineParameterKind;
}

// @public
class CommandLineParameter<T> {
  // @internal
  constructor(definition: IBaseCommandLineDefinition);
  // @internal
  _parserKey: string;
  // @internal
  _setValue(data: T): void;
  readonly description: string;
  readonly kind: CommandLineParameterKind;
  readonly longName: string;
  readonly shortName: string | undefined;
  readonly value: T;
}

// @public
enum CommandLineParameterKind {
  Choice = 0,
  Flag = 1,
  Integer = 2,
  String = 3,
  StringList = 4
}

// @public
class CommandLineParameterProvider {
  // @internal
  constructor();
  // @internal
  protected abstract _getArgumentParser(): argparse.ArgumentParser;
  // @internal (undocumented)
  protected _processParsedData(data: ICommandLineParserData): void;
  defineChoiceParameter(definition: ICommandLineChoiceDefinition): CommandLineChoiceParameter;
  defineFlagParameter(definition: ICommandLineFlagDefinition): CommandLineFlagParameter;
  defineIntegerParameter(definition: ICommandLineIntegerDefinition): CommandLineIntegerParameter;
  defineStringListParameter(definition: ICommandLineStringListDefinition): CommandLineStringListParameter;
  defineStringParameter(definition: ICommandLineStringDefinition): CommandLineStringParameter;
  getChoiceParameter(parameterLongName: string): CommandLineChoiceParameter;
  getFlagParameter(parameterLongName: string): CommandLineFlagParameter;
  getIntegerParameter(parameterLongName: string): CommandLineIntegerParameter;
  getStringListParameter(parameterLongName: string): CommandLineStringListParameter;
  getStringParameter(parameterLongName: string): CommandLineStringParameter;
  protected abstract onDefineParameters(): void;
  readonly parameters: ReadonlyArray<CommandLineParameter<any>>;
  renderHelpText(): string;
}

// @public
class CommandLineParameterWithArgument<T> extends CommandLineParameter<T> {
  // @internal
  constructor(definition: IBaseCommandLineDefinitionWithArgument);
  readonly argumentName: string;
}

// @public
class CommandLineParser extends CommandLineParameterProvider {
  constructor(options: ICommandLineParserOptions);
  // @internal
  protected _getArgumentParser(): argparse.ArgumentParser;
  addAction(action: CommandLineAction): void;
  execute(args?: string[]): Promise<boolean>;
  executeWithoutErrorHandling(args?: string[]): Promise<void>;
  protected onExecute(): Promise<void>;
  selectedAction: CommandLineAction | undefined;
}

// @public
class CommandLineStringListParameter extends CommandLineParameterWithArgument<string[]> {
  // @internal
  constructor(definition: ICommandLineStringListDefinition);
  readonly kind: CommandLineParameterKind;
}

// @public
class CommandLineStringParameter extends CommandLineParameterWithArgument<string> {
  // @internal
  constructor(definition: ICommandLineStringDefinition);
  readonly kind: CommandLineParameterKind;
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
interface IBaseCommandLineDefinitionWithArgument extends IBaseCommandLineDefinition {
  argumentName: string;
}

// @public
interface ICommandLineActionOptions {
  actionVerb: string;
  documentation: string;
  summary: string;
}

// @public
interface ICommandLineChoiceDefinition extends IBaseCommandLineDefinition {
  alternatives: string[];
  defaultValue?: string;
}

// @public
interface ICommandLineFlagDefinition extends IBaseCommandLineDefinition {
}

// @public
interface ICommandLineIntegerDefinition extends IBaseCommandLineDefinitionWithArgument {
}

// @public
interface ICommandLineParserOptions {
  toolDescription: string;
  toolFilename: string;
}

// @public
interface ICommandLineStringDefinition extends IBaseCommandLineDefinitionWithArgument {
}

// @public
interface ICommandLineStringListDefinition extends IBaseCommandLineDefinitionWithArgument {
}

