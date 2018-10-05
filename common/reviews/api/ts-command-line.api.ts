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
  readonly actionName: string;
  readonly documentation: string;
  protected abstract onDefineParameters(): void;
  protected abstract onExecute(): Promise<void>;
  readonly summary: string;
}

// @public
class CommandLineChoiceParameter extends CommandLineParameter {
  // @internal
  constructor(definition: ICommandLineChoiceDefinition);
  // @internal
  _getSupplementaryNotes(supplementaryNotes: string[]): void;
  // @internal
  _setValue(data: any): void;
  readonly alternatives: ReadonlyArray<string>;
  // @override
  appendToArgList(argList: string[]): void;
  readonly defaultValue: string | undefined;
  readonly kind: CommandLineParameterKind;
  readonly value: string | undefined;
}

// @public
class CommandLineFlagParameter extends CommandLineParameter {
  // @internal
  constructor(definition: ICommandLineFlagDefinition);
  // @internal
  _setValue(data: any): void;
  // @override
  appendToArgList(argList: string[]): void;
  readonly kind: CommandLineParameterKind;
  readonly value: boolean;
}

// @public
class CommandLineIntegerParameter extends CommandLineParameterWithArgument {
  // @internal
  constructor(definition: ICommandLineIntegerDefinition);
  // @internal
  _getSupplementaryNotes(supplementaryNotes: string[]): void;
  // @internal
  _setValue(data: any): void;
  // @override
  appendToArgList(argList: string[]): void;
  readonly defaultValue: number | undefined;
  readonly kind: CommandLineParameterKind;
  readonly value: number | undefined;
}

// @public
class CommandLineParameter {
  // @internal
  constructor(definition: IBaseCommandLineDefinition);
  // @internal
  _getSupplementaryNotes(supplementaryNotes: string[]): void;
  // @internal
  _parserKey: string;
  // @internal
  abstract _setValue(data: any): void;
  abstract appendToArgList(argList: string[]): void;
  readonly description: string;
  readonly environmentVariable: string | undefined;
  readonly kind: CommandLineParameterKind;
  readonly longName: string;
  protected reportInvalidData(data: any): never;
  readonly required: boolean;
  readonly shortName: string | undefined;
  // (undocumented)
  protected validateDefaultValue(hasDefaultValue: boolean): void;
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
  readonly parameters: ReadonlyArray<CommandLineParameter>;
  renderHelpText(): string;
}

// @public
class CommandLineParameterWithArgument extends CommandLineParameter {
  // @internal
  constructor(definition: IBaseCommandLineDefinitionWithArgument);
  readonly argumentName: string;
}

// @public
class CommandLineParser extends CommandLineParameterProvider {
  constructor(options: ICommandLineParserOptions);
  // @internal
  protected _getArgumentParser(): argparse.ArgumentParser;
  readonly actions: ReadonlyArray<CommandLineAction>;
  addAction(action: CommandLineAction): void;
  execute(args?: string[]): Promise<boolean>;
  executeWithoutErrorHandling(args?: string[]): Promise<void>;
  getAction(actionName: string): CommandLineAction;
  protected onExecute(): Promise<void>;
  selectedAction: CommandLineAction | undefined;
  readonly toolDescription: string;
  readonly toolFilename: string;
  tryGetAction(actionName: string): CommandLineAction | undefined;
}

// @public
class CommandLineStringListParameter extends CommandLineParameterWithArgument {
  // @internal
  constructor(definition: ICommandLineStringListDefinition);
  // @internal
  _setValue(data: any): void;
  // @override
  appendToArgList(argList: string[]): void;
  readonly kind: CommandLineParameterKind;
  readonly values: ReadonlyArray<string>;
}

// @public
class CommandLineStringParameter extends CommandLineParameterWithArgument {
  // @internal
  constructor(definition: ICommandLineStringDefinition);
  // @internal
  _getSupplementaryNotes(supplementaryNotes: string[]): void;
  // @internal
  _setValue(data: any): void;
  // @override
  appendToArgList(argList: string[]): void;
  readonly defaultValue: string | undefined;
  readonly kind: CommandLineParameterKind;
  readonly value: string | undefined;
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
  environmentVariable?: string;
  parameterLongName: string;
  parameterShortName?: string;
  required?: boolean;
}

// @public
interface IBaseCommandLineDefinitionWithArgument extends IBaseCommandLineDefinition {
  argumentName: string;
}

// @public
interface ICommandLineActionOptions {
  actionName: string;
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
  defaultValue?: number;
}

// @public
interface ICommandLineParserOptions {
  toolDescription: string;
  toolFilename: string;
}

// @public
interface ICommandLineStringDefinition extends IBaseCommandLineDefinitionWithArgument {
  defaultValue?: string;
}

// @public
interface ICommandLineStringListDefinition extends IBaseCommandLineDefinitionWithArgument {
}

