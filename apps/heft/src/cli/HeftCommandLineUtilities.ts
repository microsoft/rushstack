import {
  IBaseCommandLineDefinition,
  IBaseCommandLineDefinitionWithArgument,
  CommandLineAction,
  CommandLineParser,
  CommandLineFlagParameter,
  CommandLineStringParameter,
  CommandLineIntegerParameter,
  CommandLineStringListParameter
} from '@rushstack/ts-command-line';
import { Terminal } from '@rushstack/node-core-library';

/**
 * @beta
 * The base set of utility values provided in every return object when registering a parameter.
 */
export interface IHeftBaseParameter {
  /**
   * The currently selected action was associated with the parameter.
   */
  readonly actionAssociated: boolean;

  /**
   * The parameter was specified on the command line.
   */
  readonly valueProvided: boolean;
}

/**
 * @beta
 * The object returned when registering a flag type parameter.
 */
export interface IHeftFlagParameter extends IHeftBaseParameter {
  /**
   * The boolean value `true` if specified on the command line.
   */
  readonly value?: boolean;
}

/**
 * @beta
 * The object returned when registering a string type parameter.
 */
export interface IHeftStringParameter extends IHeftBaseParameter {
  /**
   * The string value specified on the command line.
   */
  readonly value?: string;
}

/**
 * @beta
 * The object returned when registering an integer type parameter.
 */
export interface IHeftIntegerParameter extends IHeftBaseParameter {
  /**
   * The integer value specified on the command line.
   */
  readonly value?: number;
}

/**
 * @beta
 * The object returned when registering a stringList type parameter.
 */
export interface IHeftStringListParameter extends IHeftBaseParameter {
  /**
   * The array of string values specified on the command line.
   */
  readonly values?: string[];
}

/**
 * @beta
 * The options object provided to the command line parser when registering a parameter
 * in addition to the action names used to associate the parameter with.
 */
export interface IRegisterParameterOptions extends IBaseCommandLineDefinition {
  /**
   * A string list of one or more action names to associate the paramter with
   */
  associatedActionNames: string[];
}

/**
 * @beta
 * The options object provided to the command line parser when registering a parameter
 * in addition to the action names used to associate the parameter with.
 */
export interface IRegisterParameterWithArgumentOptions extends IBaseCommandLineDefinitionWithArgument {
  /**
   * A string list of one or more action names to associate the paramter with
   */
  associatedActionNames: string[];
}

/**
 * @beta
 * Command line utilities provided for Heft plugin developers.
 */
export class HeftCommandLineUtilities {
  private readonly _commandLineParser: CommandLineParser;
  private readonly _terminal: Terminal;

  public constructor(commandLineParser: CommandLineParser, terminal: Terminal) {
    this._commandLineParser = commandLineParser;
    this._terminal = terminal;
  }

  /**
   * Utility method used by Heft plugins to register a flag type parameter.
   */
  public registerFlagParameter(options: IRegisterParameterOptions): IHeftFlagParameter {
    const actionParameterMap: Map<CommandLineAction, CommandLineFlagParameter> = new Map();
    for (const action of this._getActions(options.associatedActionNames)) {
      this._verifyUniqueParameterName(action, options);
      const parameter: CommandLineFlagParameter = action.defineFlagParameter(options);
      actionParameterMap.set(action, parameter);
    }
    const parameterObject: Partial<IHeftFlagParameter> = {};
    Object.defineProperties(parameterObject, {
      value: {
        get: (): boolean | undefined => {
          this._verifyParametersProcessed(options.parameterLongName);
          if (this._commandLineParser.selectedAction) {
            return actionParameterMap.get(this._commandLineParser.selectedAction)?.value;
          }
        }
      },
      actionAssociated: {
        get: (): boolean => {
          if (this._commandLineParser.selectedAction) {
            if (actionParameterMap.get(this._commandLineParser.selectedAction)) {
              return true;
            }
          }
          return false;
        }
      },
      valueProvided: {
        get: (): boolean => {
          if (this._commandLineParser.selectedAction) {
            if (actionParameterMap.get(this._commandLineParser.selectedAction)?.value) {
              return true;
            }
          }
          return false;
        }
      }
    });
    return parameterObject as IHeftFlagParameter;
  }

  /**
   * Utility method used by Heft plugins to register a string type parameter.
   */
  public registerStringParameter(options: IRegisterParameterWithArgumentOptions): IHeftStringParameter {
    const actionParameterMap: Map<CommandLineAction, CommandLineStringParameter> = new Map();
    for (const action of this._getActions(options.associatedActionNames)) {
      this._verifyUniqueParameterName(action, options);
      const parameter: CommandLineStringParameter = action.defineStringParameter(options);
      actionParameterMap.set(action, parameter);
    }
    const parameterObject: Partial<IHeftStringParameter> = {};
    Object.defineProperties(parameterObject, {
      value: {
        get: (): string | undefined => {
          this._verifyParametersProcessed(options.parameterLongName);
          if (this._commandLineParser.selectedAction) {
            return actionParameterMap.get(this._commandLineParser.selectedAction)?.value;
          }
        }
      },
      actionAssociated: {
        get: (): boolean => {
          if (this._commandLineParser.selectedAction) {
            if (actionParameterMap.get(this._commandLineParser.selectedAction)) {
              return true;
            }
          }
          return false;
        }
      },
      valueProvided: {
        get: (): boolean => {
          if (this._commandLineParser.selectedAction) {
            if (
              typeof actionParameterMap.get(this._commandLineParser.selectedAction)?.value !== 'undefined'
            ) {
              return true;
            }
          }
          return false;
        }
      }
    });
    return parameterObject as IHeftStringParameter;
  }

  /**
   * Utility method used by Heft plugins to register an integer type parameter.
   */
  public registerIntegerParameter(options: IRegisterParameterWithArgumentOptions): IHeftIntegerParameter {
    const actionParameterMap: Map<CommandLineAction, CommandLineIntegerParameter> = new Map();
    for (const action of this._getActions(options.associatedActionNames)) {
      this._verifyUniqueParameterName(action, options);
      const parameter: CommandLineIntegerParameter = action.defineIntegerParameter(options);
      actionParameterMap.set(action, parameter);
    }
    const parameterObject: Partial<IHeftIntegerParameter> = {};
    Object.defineProperties(parameterObject, {
      value: {
        get: (): number | undefined => {
          this._verifyParametersProcessed(options.parameterLongName);
          if (this._commandLineParser.selectedAction) {
            return actionParameterMap.get(this._commandLineParser.selectedAction)?.value;
          }
        }
      },
      actionAssociated: {
        get: (): boolean => {
          if (this._commandLineParser.selectedAction) {
            if (actionParameterMap.get(this._commandLineParser.selectedAction)) {
              return true;
            }
          }
          return false;
        }
      },
      valueProvided: {
        get: (): boolean => {
          if (this._commandLineParser.selectedAction) {
            if (
              typeof actionParameterMap.get(this._commandLineParser.selectedAction)?.value !== 'undefined'
            ) {
              return true;
            }
          }
          return false;
        }
      }
    });
    return parameterObject as IHeftIntegerParameter;
  }

  /**
   * Utility method used by Heft plugins to register a stringList type parameter.
   */
  public registerStringListParameter(
    options: IRegisterParameterWithArgumentOptions
  ): IHeftStringListParameter {
    const actionParameterMap: Map<CommandLineAction, CommandLineStringListParameter> = new Map();
    for (const action of this._getActions(options.associatedActionNames)) {
      this._verifyUniqueParameterName(action, options);
      const parameter: CommandLineStringListParameter = action.defineStringListParameter(options);
      actionParameterMap.set(action, parameter);
    }
    const parameterObject: Partial<IHeftStringListParameter> = {};
    Object.defineProperties(parameterObject, {
      values: {
        get: (): readonly string[] | undefined => {
          this._verifyParametersProcessed(options.parameterLongName);
          if (this._commandLineParser.selectedAction) {
            return actionParameterMap.get(this._commandLineParser.selectedAction)?.values;
          }
        }
      },
      actionAssociated: {
        get: (): boolean => {
          if (this._commandLineParser.selectedAction) {
            if (actionParameterMap.get(this._commandLineParser.selectedAction)) {
              return true;
            }
          }
          return false;
        }
      },
      valueProvided: {
        get: (): boolean => {
          if (this._commandLineParser.selectedAction) {
            if ((actionParameterMap.get(this._commandLineParser.selectedAction)?.values || []).length) {
              return true;
            }
          }
          return false;
        }
      }
    });
    return parameterObject as IHeftStringListParameter;
  }

  private _getActions(actionNames: string[]): CommandLineAction[] {
    const actions: CommandLineAction[] = [];
    for (const actionName of actionNames) {
      const action: CommandLineAction | undefined = this._commandLineParser.tryGetAction(actionName);
      if (action) {
        if (action.parametersProcessed) {
          throw new Error(
            `Unable to register parameters for action "${action.actionName}" after parameters have already been processed`
          );
        }
        actions.push(action);
      } else {
        this._terminal.writeVerboseLine(
          `Unable to get a reference for action "${actionName}" while registering custom parameters`
        );
      }
    }
    return actions;
  }

  private _verifyUniqueParameterName(action: CommandLineAction, options: IRegisterParameterOptions): void {
    const existingParameterLongNames: Set<string> = new Set(
      action.parameters.map((parameter) => parameter.longName)
    );

    if (existingParameterLongNames.has(options.parameterLongName)) {
      throw new Error(`Attempting to register duplicate parameter long name: ${options.parameterLongName}`);
    }

    if (options.parameterShortName) {
      const existingParameterShortNames: Set<string | undefined> = new Set(
        action.parameters.map((parameter) => parameter.shortName)
      );
      if (existingParameterShortNames.has(options.parameterShortName)) {
        throw new Error(
          `Attempting to register duplicate parameter short name: ${options.parameterShortName}`
        );
      }
    }
  }

  private _verifyParametersProcessed(parameterName: string): void {
    if (!this._commandLineParser.parametersProcessed) {
      throw new Error(
        `Unable to access parameter value for "${parameterName}" prior to command line processing`
      );
    }
  }
}
