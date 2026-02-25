// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as argparse from 'argparse';

import { CommandLineAction } from './CommandLineAction.ts';
import {
  CommandLineParameterKind,
  type CommandLineParameterBase,
  type CommandLineParameter
} from '../parameters/BaseClasses.ts';
import type {
  ICommandLineParserData,
  IRegisterDefinedParametersState
} from './CommandLineParameterProvider.ts';
import type { ICommandLineParserOptions } from './CommandLineParser.ts';

/**
 * Options for the AliasCommandLineAction constructor.
 * @public
 */
export interface IAliasCommandLineActionOptions {
  /**
   * The name of your tool when invoked from the command line. Used for generating help text.
   */
  toolFilename: string;

  /**
   * The name of the alias.  For example, if the tool is called "example",
   * then the "build" alias might be invoked as: "example build -q --some-other-option"
   */
  aliasName: string;

  /**
   * A list of default parameters to pass to the target action.
   */
  defaultParameters?: string[];

  /**
   * The action that this alias invokes.
   */
  targetAction: CommandLineAction;
}

/**
 * Represents a sub-command that is part of the CommandLineParser command line.
 * The sub-command is an alias for another existing action.
 *
 * The alias name should be comprised of lower case words separated by hyphens
 * or colons. The name should include an English verb (e.g. "deploy"). Use a
 * hyphen to separate words (e.g. "upload-docs").
 *
 * @public
 */
export class AliasCommandLineAction extends CommandLineAction {
  /**
   * The action that this alias invokes.
   */
  public readonly targetAction: CommandLineAction;

  /**
   * A list of default arguments to pass to the target action.
   */
  public readonly defaultParameters: ReadonlyArray<string>;

  private _parameterKeyMap: Map<string, string> = new Map();

  public constructor(options: IAliasCommandLineActionOptions) {
    const toolFilename: string = options.toolFilename;
    const targetActionName: string = options.targetAction.actionName;
    const defaultParametersString: string = (options.defaultParameters || []).join(' ');
    const summary: string = `An alias for "${toolFilename} ${targetActionName}${
      defaultParametersString ? ` ${defaultParametersString}` : ''
    }".`;

    super({
      actionName: options.aliasName,
      summary,
      documentation:
        `${summary} For more information on the aliased command, use ` +
        `"${toolFilename} ${targetActionName} --help".`
    });

    this.targetAction = options.targetAction;
    this.defaultParameters = options.defaultParameters || [];
  }

  /** @internal */
  public _registerDefinedParameters(state: IRegisterDefinedParametersState): void {
    /* override */
    // All parameters are going to be defined by the target action. Re-use the target action parameters
    // for this action.
    for (const parameter of this.targetAction.parameters as CommandLineParameter[]) {
      const { kind, longName, shortName } = parameter;
      let aliasParameter: CommandLineParameterBase;
      const nameOptions: { parameterLongName: string; parameterShortName: string | undefined } = {
        parameterLongName: longName,
        parameterShortName: shortName
      };
      switch (kind) {
        case CommandLineParameterKind.Choice:
          aliasParameter = this.defineChoiceParameter({
            ...nameOptions,
            ...parameter,
            alternatives: [...parameter.alternatives]
          });
          break;
        case CommandLineParameterKind.ChoiceList:
          aliasParameter = this.defineChoiceListParameter({
            ...nameOptions,
            ...parameter,
            alternatives: [...parameter.alternatives]
          });
          break;
        case CommandLineParameterKind.Flag:
          aliasParameter = this.defineFlagParameter({ ...nameOptions, ...parameter });
          break;
        case CommandLineParameterKind.Integer:
          aliasParameter = this.defineIntegerParameter({ ...nameOptions, ...parameter });
          break;
        case CommandLineParameterKind.IntegerList:
          aliasParameter = this.defineIntegerListParameter({ ...nameOptions, ...parameter });
          break;
        case CommandLineParameterKind.String:
          aliasParameter = this.defineStringParameter({ ...nameOptions, ...parameter });
          break;
        case CommandLineParameterKind.StringList:
          aliasParameter = this.defineStringListParameter({ ...nameOptions, ...parameter });
          break;
        default:
          throw new Error(`Unsupported parameter kind: ${kind}`);
      }

      // We know the parserKey is defined because the underlying _defineParameter method sets it,
      // and all parameters that we have access to have already been defined.
      this._parameterKeyMap.set(aliasParameter._parserKey!, parameter._parserKey!);
    }

    // We also need to register the remainder parameter if the target action has one. The parser
    // key for this parameter is constant.
    if (this.targetAction.remainder) {
      this.defineCommandLineRemainder(this.targetAction.remainder);
      this._parameterKeyMap.set(argparse.Const.REMAINDER, argparse.Const.REMAINDER);
    }

    // Finally, register the parameters with the parser. We need to make sure that the target action
    // is registered, since we need to re-use its parameters, and ambiguous parameters are discovered
    // during registration. This will no-op if the target action is already registered.
    this.targetAction._registerDefinedParameters(state);
    super._registerDefinedParameters(state);

    // We need to re-map the ambiguous parameters after they are defined by calling
    // super._registerDefinedParameters()
    for (const [ambiguousParameterName, parserKey] of this._ambiguousParameterParserKeysByName) {
      const targetParserKey: string | undefined =
        this.targetAction._ambiguousParameterParserKeysByName.get(ambiguousParameterName);

      // If we have a mapping for the specified key, then use it. Otherwise, use the key as-is.
      if (targetParserKey) {
        this._parameterKeyMap.set(parserKey, targetParserKey);
      }
    }
  }

  /**
   * {@inheritdoc CommandLineParameterProvider._processParsedData}
   * @internal
   */
  public _processParsedData(parserOptions: ICommandLineParserOptions, data: ICommandLineParserData): void {
    // Re-map the parsed data to the target action's parameters and execute the target action processor.
    const targetData: ICommandLineParserData = {
      action: this.targetAction.actionName,
      aliasAction: data.action,
      aliasDocumentation: this.documentation
    };
    for (const [key, value] of Object.entries(data)) {
      // If we have a mapping for the specified key, then use it. Otherwise, use the key as-is.
      // Skip over the action key though, since we've already re-mapped it to "aliasAction"
      if (key === 'action') {
        continue;
      }
      const targetKey: string | undefined = this._parameterKeyMap.get(key);
      targetData[targetKey ?? key] = value;
    }
    this.targetAction._processParsedData(parserOptions, targetData);
  }

  /**
   * Executes the target action.
   */
  protected override async onExecuteAsync(): Promise<void> {
    await this.targetAction._executeAsync();
  }
}
