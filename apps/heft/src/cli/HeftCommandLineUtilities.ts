import {
  IBaseCommandLineDefinition,
  IBaseCommandLineDefinitionWithArgument,
  CommandLineAction,
  CommandLineParser,
  CommandLineFlagParameter,
  CommandLineStringParameter,
  CommandLineIntegerParameter,
  CommandLineStringListParameter,
  CommandLineParameter
} from '@rushstack/ts-command-line';
import { Terminal } from '@rushstack/node-core-library';

import { CustomActionParameterType } from './actions/CustomAction';

/**
 * @beta
 * The base set of utility values provided in every object returned when registering a parameter.
 */
export interface IHeftBaseParameter<TValue> {
  /**
   * The value specified on the command line for this parameter.
   */
  readonly value?: TValue;

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
export type IHeftFlagParameter = IHeftBaseParameter<boolean>;

/**
 * @beta
 * The object returned when registering a string type parameter.
 */
export type IHeftStringParameter = IHeftBaseParameter<string>;

/**
 * @beta
 * The object returned when registering an integer type parameter.
 */
export type IHeftIntegerParameter = IHeftBaseParameter<number>;

/**
 * @beta
 * The object returned when registering a stringList type parameter.
 */
export type IHeftStringListParameter = IHeftBaseParameter<readonly string[]>;

/**
 * @beta
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
export type IRegisterParameterOptions = IBaseCommandLineDefinition & IParameterAssociatedActionNames;

/**
 * @beta
 * The options object provided to the command line parser when registering a parameter
 * in addition to the action names used to associate the parameter with.
 */
export type IRegisterParameterWithArgumentOptions = IBaseCommandLineDefinitionWithArgument &
  IParameterAssociatedActionNames;

/**
 * @beta
 * Command line utilities provided for Heft plugin developers.
 */
export class HeftCommandLineUtilities {
  private readonly _commandLineParser: CommandLineParser;
  private readonly _terminal: Terminal;

  /**
   * @internal
   */
  public constructor(commandLineParser: CommandLineParser, terminal: Terminal) {
    this._commandLineParser = commandLineParser;
    this._terminal = terminal;
  }

  /**
   * Utility method used by Heft plugins to register a flag type parameter.
   */
  public registerFlagParameter(options: IRegisterParameterOptions): IHeftFlagParameter {
    return this._registerParameter(
      options,
      (action: CommandLineAction) => action.defineFlagParameter(options),
      (parameter: CommandLineFlagParameter) => parameter.value,
      (parameter: CommandLineFlagParameter) => parameter.value
    );
  }

  /**
   * Utility method used by Heft plugins to register a string type parameter.
   */
  public registerStringParameter(options: IRegisterParameterWithArgumentOptions): IHeftStringParameter {
    return this._registerParameter(
      options,
      (action: CommandLineAction) => action.defineStringParameter(options),
      (parameter: CommandLineStringParameter) => parameter.value,
      (parameter: CommandLineStringParameter) => typeof parameter.value !== 'undefined'
    );
  }

  /**
   * Utility method used by Heft plugins to register an integer type parameter.
   */
  public registerIntegerParameter(options: IRegisterParameterWithArgumentOptions): IHeftIntegerParameter {
    return this._registerParameter(
      options,
      (action: CommandLineAction) => action.defineIntegerParameter(options),
      (parameter: CommandLineIntegerParameter) => parameter.value,
      (parameter: CommandLineIntegerParameter) => typeof parameter.value !== 'undefined'
    );
  }

  /**
   * Utility method used by Heft plugins to register a stringList type parameter.
   */
  public registerStringListParameter(
    options: IRegisterParameterWithArgumentOptions
  ): IHeftStringListParameter {
    return this._registerParameter(
      options,
      (action: CommandLineAction) => action.defineStringListParameter(options),
      (parameter: CommandLineStringListParameter) => parameter.values,
      (parameter: CommandLineStringListParameter) => (parameter.values || []).length > 0
    );
  }

  private _registerParameter<
    TTSCommandLineParameter extends CommandLineParameter,
    TValue extends CustomActionParameterType
  >(
    options: IRegisterParameterOptions,
    defineParameterForAction: (action: CommandLineAction) => TTSCommandLineParameter,
    getParameterValue: (parameter: TTSCommandLineParameter) => TValue | undefined,
    getValueIsProvided: (parameter: TTSCommandLineParameter) => boolean
  ): IHeftBaseParameter<TValue> {
    const actionParameterMap: Map<CommandLineAction, TTSCommandLineParameter> = new Map();
    for (const action of this._getActions(options.associatedActionNames)) {
      this._verifyUniqueParameterName(action, options);
      const parameter: TTSCommandLineParameter = defineParameterForAction(action);
      actionParameterMap.set(action, parameter);
    }

    const self: HeftCommandLineUtilities = this;
    const parameterObject: IHeftBaseParameter<TValue> = {
      get value(): TValue | undefined {
        self._verifyParametersProcessed(options.parameterLongName);
        if (self._commandLineParser.selectedAction) {
          const parameter: TTSCommandLineParameter | undefined = actionParameterMap.get(
            self._commandLineParser.selectedAction
          );
          if (parameter) {
            return getParameterValue(parameter);
          }
        }

        return undefined;
      },

      get actionAssociated(): boolean {
        if (self._commandLineParser.selectedAction) {
          if (actionParameterMap.get(self._commandLineParser.selectedAction)) {
            return true;
          }
        }

        return false;
      },

      get valueProvided(): boolean {
        if (self._commandLineParser.selectedAction) {
          const parameter: TTSCommandLineParameter | undefined = actionParameterMap.get(
            self._commandLineParser.selectedAction
          );
          if (parameter) {
            return getValueIsProvided(parameter);
          }
        }

        return false;
      }
    };

    return parameterObject;
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
