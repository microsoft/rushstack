import {
  IBaseCommandLineDefinition,
  ICommandLineFlagDefinition,
  ICommandLineIntegerDefinition,
  ICommandLineStringDefinition,
  ICommandLineStringListDefinition,
  ICommandLineChoiceDefinition,
  ICommandLineChoiceListDefinition,
  CommandLineAction,
  CommandLineParser,
  CommandLineFlagParameter,
  CommandLineIntegerParameter,
  CommandLineStringParameter,
  CommandLineStringListParameter,
  CommandLineChoiceParameter,
  CommandLineChoiceListParameter,
  CommandLineParameter
} from '@rushstack/ts-command-line';
import { ITerminal } from '@rushstack/node-core-library';

/**
 * @beta
 * The base set of utility values provided in every object returned when registering a parameter.
 */
export interface IHeftBaseParameter<TValue, TCommandLineDefinition extends IBaseCommandLineDefinition> {
  /**
   * The value specified on the command line for this parameter.
   */
  readonly value?: TValue;

  /**
   * If true, then the user has invoked Heft with a command line action that supports this parameter
   * (as defined by the {@link IParameterAssociatedActionNames.associatedActionNames} option).
   *
   * @remarks
   * For example, if `build` is one of the associated action names for `--my-integer-parameter`,
   * then `actionAssociated` will be true if the user invokes `heft build`.
   *
   * To test whether the parameter was actually included (e.g. `heft build --my-integer-parameter 123`),
   * verify the {@link IHeftBaseParameter.value} property is not `undefined`.
   */
  readonly actionAssociated: boolean;

  /**
   * The options {@link IHeftRegisterParameterOptions} used to create and register the parameter with
   * a Heft command line action.
   */
  readonly definition: IHeftRegisterParameterOptions<TCommandLineDefinition>;
}

/**
 * @beta
 * The object returned when registering a choice type parameter.
 */
export type IHeftChoiceParameter = IHeftBaseParameter<string, ICommandLineChoiceDefinition>;

/**
 * @beta
 * The object returned when registering a choiceList type parameter.
 */
export type IHeftChoiceListParameter = IHeftBaseParameter<
  readonly string[],
  ICommandLineChoiceListDefinition
>;

/**
 * @beta
 * The object returned when registering a flag type parameter.
 */
export type IHeftFlagParameter = IHeftBaseParameter<boolean, ICommandLineFlagDefinition>;

/**
 * @beta
 * The object returned when registering an integer type parameter.
 */
export type IHeftIntegerParameter = IHeftBaseParameter<number, ICommandLineIntegerDefinition>;

/**
 * @beta
 * The object returned when registering a string type parameter.
 */
export type IHeftStringParameter = IHeftBaseParameter<string, ICommandLineStringDefinition>;

/**
 * @beta
 * The object returned when registering a stringList type parameter.
 */
export type IHeftStringListParameter = IHeftBaseParameter<
  readonly string[],
  ICommandLineStringListDefinition
>;

/**
 * @beta
 * The configuration interface for associating a parameter definition with a Heft
 * command line action in {@link IHeftRegisterParameterOptions}.
 */
export interface IParameterAssociatedActionNames {
  /**
   * A string list of one or more action names to associate the parameter with.
   */
  associatedActionNames: string[];
}

/**
 * @beta
 * The options object provided to the command line parser when registering a parameter
 * in addition to the action names used to associate the parameter with.
 */
export type IHeftRegisterParameterOptions<TCommandLineDefinition extends IBaseCommandLineDefinition> =
  TCommandLineDefinition & IParameterAssociatedActionNames;

/**
 * @beta
 * Command line utilities provided for Heft plugin developers.
 */
export class HeftCommandLine {
  private readonly _commandLineParser: CommandLineParser;
  private readonly _terminal: ITerminal;

  /**
   * @internal
   */
  public constructor(commandLineParser: CommandLineParser, terminal: ITerminal) {
    this._commandLineParser = commandLineParser;
    this._terminal = terminal;
  }

  /**
   * Utility method used by Heft plugins to register a choice type parameter.
   */
  public registerChoiceParameter(
    options: IHeftRegisterParameterOptions<ICommandLineChoiceDefinition>
  ): IHeftChoiceParameter {
    return this._registerParameter(
      options,
      (action: CommandLineAction) => action.defineChoiceParameter(options),
      (parameter: CommandLineChoiceParameter) => parameter.value
    );
  }

  /**
   * Utility method used by Heft plugins to register a choiceList type parameter.
   */
  public registerChoiceListParameter(
    options: IHeftRegisterParameterOptions<ICommandLineChoiceListDefinition>
  ): IHeftChoiceListParameter {
    return this._registerParameter(
      options,
      (action: CommandLineAction) => action.defineChoiceListParameter(options),
      (parameter: CommandLineChoiceListParameter) => parameter.values
    );
  }

  /**
   * Utility method used by Heft plugins to register a flag type parameter.
   */
  public registerFlagParameter(
    options: IHeftRegisterParameterOptions<ICommandLineFlagDefinition>
  ): IHeftFlagParameter {
    return this._registerParameter(
      options,
      (action: CommandLineAction) => action.defineFlagParameter(options),
      (parameter: CommandLineFlagParameter) => parameter.value
    );
  }

  /**
   * Utility method used by Heft plugins to register an integer type parameter.
   */
  public registerIntegerParameter(
    options: IHeftRegisterParameterOptions<ICommandLineIntegerDefinition>
  ): IHeftIntegerParameter {
    return this._registerParameter(
      options,
      (action: CommandLineAction) => action.defineIntegerParameter(options),
      (parameter: CommandLineIntegerParameter) => parameter.value
    );
  }

  /**
   * Utility method used by Heft plugins to register a string type parameter.
   */
  public registerStringParameter(
    options: IHeftRegisterParameterOptions<ICommandLineStringDefinition>
  ): IHeftStringParameter {
    return this._registerParameter(
      options,
      (action: CommandLineAction) => action.defineStringParameter(options),
      (parameter: CommandLineStringParameter) => parameter.value
    );
  }

  /**
   * Utility method used by Heft plugins to register a stringList type parameter.
   */
  public registerStringListParameter(
    options: IHeftRegisterParameterOptions<ICommandLineStringListDefinition>
  ): IHeftStringListParameter {
    return this._registerParameter(
      options,
      (action: CommandLineAction) => action.defineStringListParameter(options),
      (parameter: CommandLineStringListParameter) => parameter.values
    );
  }

  private _registerParameter<
    TCommandLineDefinition extends IBaseCommandLineDefinition,
    TCommandLineParameter extends CommandLineParameter,
    TValue
  >(
    options: IHeftRegisterParameterOptions<TCommandLineDefinition>,
    defineParameterForAction: (action: CommandLineAction) => TCommandLineParameter,
    getParameterValue: (parameter: TCommandLineParameter) => TValue | undefined
  ): IHeftBaseParameter<TValue, TCommandLineDefinition> {
    const actionParameterMap: Map<CommandLineAction, TCommandLineParameter> = new Map();
    for (const action of this._getActions(options.associatedActionNames, options.parameterLongName)) {
      this._verifyUniqueParameterName(action, options);
      const parameter: TCommandLineParameter = defineParameterForAction(action);
      actionParameterMap.set(action, parameter);
    }

    const parameterObject: IHeftBaseParameter<TValue, TCommandLineDefinition> = Object.defineProperties(
      {} as IHeftBaseParameter<TValue, TCommandLineDefinition>,
      {
        value: {
          get: (): TValue | undefined => {
            this._verifyParametersProcessed(options.parameterLongName);
            if (this._commandLineParser.selectedAction) {
              const parameter: TCommandLineParameter | undefined = actionParameterMap.get(
                this._commandLineParser.selectedAction
              );
              if (parameter) {
                return getParameterValue(parameter);
              }
            }

            return undefined;
          }
        },

        actionAssociated: {
          get: (): boolean => {
            if (!this._commandLineParser.selectedAction) {
              throw new Error('Unable to determine the selected action prior to command line processing');
            }
            if (actionParameterMap.get(this._commandLineParser.selectedAction)) {
              return true;
            }
            return false;
          }
        },

        definition: {
          get: (): IHeftRegisterParameterOptions<TCommandLineDefinition> => {
            return { ...options };
          }
        }
      }
    );

    return parameterObject;
  }

  private _getActions(actionNames: string[], parameterLongName: string): CommandLineAction[] {
    const actions: CommandLineAction[] = [];
    for (const actionName of actionNames) {
      const action: CommandLineAction | undefined = this._commandLineParser.tryGetAction(actionName);
      if (action) {
        if (action.parametersProcessed) {
          throw new Error(
            `Unable to register parameter "${parameterLongName}" for action "${action.actionName}". ` +
              'Parameters have already been processed.'
          );
        }
        actions.push(action);
      } else {
        this._terminal.writeVerboseLine(
          `Unable to find action "${actionName}" while registering the "${parameterLongName}" parameter`
        );
      }
    }
    return actions;
  }

  private _verifyUniqueParameterName<TCommandLineDefinition extends IBaseCommandLineDefinition>(
    action: CommandLineAction,
    options: IHeftRegisterParameterOptions<TCommandLineDefinition>
  ): void {
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
