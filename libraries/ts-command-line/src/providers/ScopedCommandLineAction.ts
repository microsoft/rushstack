// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SCOPING_PARAMETER_GROUP } from '../Constants';
import { CommandLineAction, ICommandLineActionOptions } from './CommandLineAction';
import { CommandLineParser, ICommandLineParserOptions } from './CommandLineParser';
import { CommandLineParserExitError } from './CommandLineParserExitError';
import type { CommandLineParameter } from '../parameters/BaseClasses';
import type { CommandLineParameterProvider, ICommandLineParserData } from './CommandLineParameterProvider';

interface IInternalScopedCommandLineParserOptions extends ICommandLineParserOptions {
  readonly actionOptions: ICommandLineActionOptions;
  readonly unscopedActionParameters: ReadonlyArray<CommandLineParameter>;
  readonly onDefineScopedParameters: (commandLineParameterProvider: CommandLineParameterProvider) => void;
  readonly aliasAction?: string;
  readonly aliasDocumentation?: string;
}

/**
 * A CommandLineParser used exclusively to parse the scoped command-line parameters
 * for a ScopedCommandLineAction.
 */
class InternalScopedCommandLineParser extends CommandLineParser {
  private _canExecute: boolean;
  private readonly _internalOptions: IInternalScopedCommandLineParserOptions;

  public get canExecute(): boolean {
    return this._canExecute;
  }

  public constructor(options: IInternalScopedCommandLineParserOptions) {
    const { actionOptions, unscopedActionParameters, toolFilename, aliasAction, aliasDocumentation } =
      options;

    const toolCommand: string = `${toolFilename} ${actionOptions.actionName}`;
    // When coming from an alias command, we want to show the alias command name in the help text
    const toolCommandForLogging: string = `${toolFilename} ${aliasAction ?? actionOptions.actionName}`;
    const scopingArgs: string[] = [];
    for (const parameter of unscopedActionParameters) {
      parameter.appendToArgList(scopingArgs);
    }
    const scope: string = scopingArgs.join(' ');

    // We can run the parser directly because we are not going to use it for any other actions,
    // so construct a special options object to make the "--help" text more useful.
    const scopedCommandLineParserOptions: ICommandLineParserOptions = {
      // Strip the scoping args if coming from an alias command, since they are not applicable
      // to the alias command itself
      toolFilename: `${toolCommandForLogging}${scope && !aliasAction ? ` ${scope} --` : ''}`,
      toolDescription: aliasDocumentation ?? actionOptions.documentation,
      toolEpilog: `For more information on available unscoped parameters, use "${toolCommand} --help"`,
      enableTabCompletionAction: false
    };

    super(scopedCommandLineParserOptions);
    this._canExecute = false;
    this._internalOptions = options;
    this._internalOptions.onDefineScopedParameters(this);
  }

  protected async onExecute(): Promise<void> {
    // override
    // Only set if we made it this far, which may not be the case if an error occurred or
    // if '--help' was specified.
    this._canExecute = true;
  }
}

/**
 * Represents a sub-command that is part of the CommandLineParser command-line.
 * Applications should create subclasses of ScopedCommandLineAction corresponding to
 * each action that they want to expose.
 *
 * The action name should be comprised of lower case words separated by hyphens
 * or colons. The name should include an English verb (e.g. "deploy"). Use a
 * hyphen to separate words (e.g. "upload-docs"). A group of related commands
 * can be prefixed with a colon (e.g. "docs:generate", "docs:deploy",
 * "docs:serve", etc).
 *
 * Scoped commands allow for different parameters to be specified for different
 * provided scoping values. For example, the "scoped-action --scope A" command
 * may allow for different scoped arguments to be specified than the "scoped-action
 * --scope B" command.
 *
 * Scoped arguments are specified after the "--" pseudo-argument. For example,
 * "scoped-action --scope A -- --scopedFoo --scopedBar".
 *
 * @public
 */
export abstract class ScopedCommandLineAction extends CommandLineAction {
  private _options: ICommandLineActionOptions;
  private _scopingParameters: CommandLineParameter[];
  private _unscopedParserOptions: ICommandLineParserOptions | undefined;
  private _scopedCommandLineParser: InternalScopedCommandLineParser | undefined;

  /**
   * The required group name to apply to all scoping parameters. At least one parameter
   * must be defined with this group name.
   */
  public static readonly ScopingParameterGroup: typeof SCOPING_PARAMETER_GROUP = SCOPING_PARAMETER_GROUP;

  public constructor(options: ICommandLineActionOptions) {
    super(options);

    this._options = options;
    this._scopingParameters = [];
  }

  /**
   * {@inheritDoc CommandLineParameterProvider.parameters}
   */
  public get parameters(): ReadonlyArray<CommandLineParameter> {
    if (this._scopedCommandLineParser) {
      return [...super.parameters, ...this._scopedCommandLineParser.parameters];
    } else {
      return super.parameters;
    }
  }

  /**
   * {@inheritdoc CommandLineAction._processParsedData}
   * @internal
   */
  public _processParsedData(parserOptions: ICommandLineParserOptions, data: ICommandLineParserData): void {
    // override
    super._processParsedData(parserOptions, data);

    this._unscopedParserOptions = parserOptions;

    // Generate the scoped parser using the parent parser information. We can only create this after we
    // have parsed the data, since the parameter values are used during construction.
    this._scopedCommandLineParser = new InternalScopedCommandLineParser({
      ...parserOptions,
      actionOptions: this._options,
      aliasAction: data.aliasAction,
      aliasDocumentation: data.aliasDocumentation,
      unscopedActionParameters: this.parameters,
      onDefineScopedParameters: this.onDefineScopedParameters.bind(this)
    });
  }

  /**
   * {@inheritdoc CommandLineAction._execute}
   * @internal
   */
  public async _execute(): Promise<void> {
    // override
    if (!this._unscopedParserOptions || !this._scopedCommandLineParser) {
      throw new Error('The CommandLineAction parameters must be processed before execution.');
    }
    if (!this.remainder) {
      throw new Error('CommandLineAction.onDefineParameters must be called before execution.');
    }

    // The '--' argument is required to separate the action parameters from the scoped parameters,
    // so it needs to be trimmed. If remainder values are provided but no '--' is found, then throw.
    const scopedArgs: string[] = [];
    if (this.remainder.values.length) {
      if (this.remainder.values[0] !== '--') {
        // Immitate argparse behavior and log out usage text before throwing.
        console.log(this.renderUsageText());
        throw new CommandLineParserExitError(
          // argparse sets exit code 2 for invalid arguments
          2,
          // model the message off of the built-in "unrecognized arguments" message
          `${this._unscopedParserOptions.toolFilename} ${this.actionName}: error: Unrecognized ` +
            `arguments: ${this.remainder.values[0]}.`
        );
      }
      for (const scopedArg of this.remainder.values.slice(1)) {
        scopedArgs.push(scopedArg);
      }
    }

    // Call the scoped parser using only the scoped args to handle parsing
    await this._scopedCommandLineParser.executeWithoutErrorHandling(scopedArgs);

    // Only call execute if the parser reached the execute stage. This may not be true if
    // the parser exited early due to a specified '--help' parameter.
    if (this._scopedCommandLineParser.canExecute) {
      await super._execute();
    }

    return;
  }

  /**
   * {@inheritdoc CommandLineParameterProvider.onDefineParameters}
   */
  protected onDefineParameters(): void {
    this.onDefineUnscopedParameters?.();

    if (!this._scopingParameters.length) {
      throw new Error(
        'No scoping parameters defined. At least one scoping parameter must be defined. ' +
          'Scoping parameters are defined by setting the parameterGroupName to ' +
          'ScopedCommandLineAction.ScopingParameterGroupName.'
      );
    }
    if (this.remainder) {
      throw new Error(
        'Unscoped remainder parameters are not allowed. Remainder parameters can only be defined on ' +
          'the scoped parameter provider in onDefineScopedParameters().'
      );
    }

    // Consume the remainder of the command-line, which will later be passed the scoped parser.
    // This will also prevent developers from calling this.defineCommandLineRemainder(...) since
    // we will have already defined it.
    this.defineCommandLineRemainder({
      description:
        'Scoped parameters.  Must be prefixed with "--", ex. "-- --scopedParameter ' +
        'foo --scopedFlag".  For more information on available scoped parameters, use "-- --help".'
    });
  }

  /**
   * Retrieves the scoped CommandLineParser, which is populated after the ScopedCommandLineAction is executed.
   * @internal
   */
  protected _getScopedCommandLineParser(): CommandLineParser {
    if (!this._scopedCommandLineParser) {
      throw new Error('The scoped CommandLineParser is only populated after the action is executed.');
    }
    return this._scopedCommandLineParser;
  }

  /** @internal */
  protected _defineParameter(parameter: CommandLineParameter): void {
    super._defineParameter(parameter);
    if (parameter.parameterGroup === ScopedCommandLineAction.ScopingParameterGroup) {
      this._scopingParameters.push(parameter);
    }
  }

  /**
   * The child class should implement this hook to define its unscoped command-line parameters,
   * e.g. by calling defineFlagParameter(). At least one scoping parameter must be defined.
   * Scoping parameters are defined by setting the parameterGroupName to
   * ScopedCommandLineAction.ScopingParameterGroupName.
   */
  protected onDefineUnscopedParameters?(): void;

  /**
   * The child class should implement this hook to define its scoped command-line
   * parameters, e.g. by calling scopedParameterProvider.defineFlagParameter(). These
   * parameters will only be available if the action is invoked with a scope.
   *
   * @remarks
   * onDefineScopedParameters is called after the unscoped parameters have been parsed.
   * The values they provide can be used to vary the defined scope parameters.
   */
  protected abstract onDefineScopedParameters(scopedParameterProvider: CommandLineParameterProvider): void;

  /**
   * {@inheritDoc CommandLineAction.onExecute}
   */
  protected abstract onExecute(): Promise<void>;
}
