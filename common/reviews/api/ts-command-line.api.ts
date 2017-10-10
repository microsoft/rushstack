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

// (undocumented)
class CommandLineFlagParameter extends CommandLineParameter<boolean> {
}

// (undocumented)
class CommandLineIntegerParameter extends CommandLineParameter<number> {
}

// (undocumented)
class CommandLineOptionParameter extends CommandLineParameter<string> {
}

// (undocumented)
class CommandLineParameter<T> {
  constructor(key: string, converter: (data: string) => T);
  // (undocumented)
  public readonly key: string;
  // (undocumented)
  public setValue(data: ICommandLineParserData): void;
  // (undocumented)
  public readonly value: T;
}

class CommandLineParameterProvider {
  constructor();
  // (undocumented)
  protected argumentParser: argparse.ArgumentParser;
  protected defineFlagParameter(options: ICommandLineFlagDefinition): CommandLineFlagParameter;
  protected defineIntegerParameter(options: ICommandLineIntegerDefinition): CommandLineIntegerParameter;
  // (undocumented)
  protected defineOptionParameter(options: ICommandLineOptionDefinition): CommandLineOptionParameter;
  protected defineStringListParameter(options: ICommandLineStringListDefinition): CommandLineStringListParameter;
  protected defineStringParameter(options: ICommandLineStringDefinition): CommandLineStringParameter;
  protected abstract onDefineParameters(): void;
  // (undocumented)
  protected processParsedData(data: ICommandLineParserData): void;
}

class CommandLineParser extends CommandLineParameterProvider {
  constructor(options: ICommandListParserOptions);
  public addAction(command: CommandLineAction): void;
  // (undocumented)
  protected chosenAction: CommandLineAction;
  public execute(args?: string[]): void;
  protected onExecute(): void;
}

// (undocumented)
class CommandLineStringListParameter extends CommandLineParameter<string[]> {
}

// (undocumented)
class CommandLineStringParameter extends CommandLineParameter<string> {
}

interface IBaseCommandLineDefinition {
  description: string;
  parameterLongName: string;
  parameterShortName?: string;
}

// (undocumented)
interface ICommandLineActionOptions {
  actionVerb: string;
  documentation: string;
  summary: string;
}

interface ICommandLineFlagDefinition extends IBaseCommandLineDefinition {
}

interface ICommandLineIntegerDefinition extends IKeyedCommandLineDefinition {
}

interface ICommandLineOptionDefinition extends IBaseCommandLineDefinition {
  options: string[];
}

// (undocumented)
interface ICommandLineParserData {
  // (undocumented)
  [ key: string ]: any;
  // (undocumented)
  action: string;
}

interface ICommandLineStringDefinition extends IKeyedCommandLineDefinition {
}

interface ICommandLineStringListDefinition extends IKeyedCommandLineDefinition {
}

// (undocumented)
interface ICommandListParserOptions {
  // (undocumented)
  toolDescription: string;
  // (undocumented)
  toolFilename: string;
}

// (No packageDescription for this package)
