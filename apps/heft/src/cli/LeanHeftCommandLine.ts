// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { CommandLineFlagParameter, CommandLineParameter } from '@rushstack/ts-command-line';
import { Colorize } from '@rushstack/terminal';

import type { HeftPhase } from '../pluginFramework/HeftPhase';
import type { HeftActionRunner } from './HeftActionRunner';
import type { IHeftAction, IHeftActionOptions } from './actions/IHeftAction';
import type { IHeftCommandLineParserState } from './HeftCommandLineParser';
import { LeanParameterProvider, type ILeanRegistration, type LeanParseResult } from './LeanParameterProvider';
import {
  definePhaseScopingParameters,
  expandPhases,
  getCleanSelectedPhases,
  getPhaseActionSelectedPhases,
  type IScopingParameters
} from './actions/PhaseScoping';
import {
  CLEAN_ACTION_DOCUMENTATION,
  DEBUG_PARAMETER_DESCRIPTION,
  HEFT_TOOL_DESCRIPTION,
  HEFT_TOOL_FILENAME,
  SCOPED_ACTION_REMAINDER_DESCRIPTION,
  UNMANAGED_PARAMETER_DESCRIPTION,
  VERBOSE_PARAMETER_DESCRIPTION,
  getPhaseActionDocumentation,
  getPhaseActionSummary,
  getRunActionDocumentation
} from './CliConstants';
import { HELP_ACTION, PARSER, type IHelpAction, type IHelpParser } from './HelpModel';
import { Constants } from '../utilities/Constants';

// Matches ts-command-line's validation of action names
const ACTION_NAME_REGEXP: RegExp = /^[a-z][a-z0-9]*([-:][a-z0-9]+)*$/;

// Matches long option strings that argparse treats as unrecognized options (no "=", spaces, etc.)
const PLAIN_LONG_OPTION_REGEXP: RegExp = /^--[a-z0-9]+(-[a-z0-9]+)*$/;

// The names that ts-command-line registers on Heft's root parser; they are registered as ambiguous in each action.
const ROOT_PARAMETER_NAMES: readonly string[] = [
  Constants.debugParameterLongName,
  Constants.unmanagedParameterLongName
];

type LeanActionKind = 'clean' | 'run' | 'phase';

interface ILeanActionDescriptor {
  readonly kind: LeanActionKind;
  readonly watch: boolean;
  readonly phase?: HeftPhase;
  readonly summary: string;
}

interface ILeanAliasDescriptor {
  readonly targetActionName: string;
  readonly defaultParameters: readonly string[];
  readonly documentation: string;
  readonly expansionMessage: string;
}

/**
 * A lean equivalent of a ts-command-line `CommandLineAction` that implements the members of {@link IHeftAction}
 * that Heft uses.
 */
class LeanHeftAction extends LeanParameterProvider {
  public readonly actionName: string;
  public readonly watch: boolean;
  #getSelectedPhases: (() => ReadonlySet<HeftPhase>) | undefined;
  #selectedPhases: ReadonlySet<HeftPhase> | undefined;
  #scopedParameters: ReadonlyArray<CommandLineParameter> | undefined;

  public constructor(actionName: string, watch: boolean) {
    super();
    this.actionName = actionName;
    this.watch = watch;
  }

  /**
   * Like the `selectedPhases` getter of Heft's actions, the selection is evaluated lazily, on first access.
   */
  public get selectedPhases(): ReadonlySet<HeftPhase> {
    if (!this.#selectedPhases) {
      this.#selectedPhases = this.#getSelectedPhases!();
    }
    return this.#selectedPhases;
  }

  public setSelectedPhasesFactory(getSelectedPhases: () => ReadonlySet<HeftPhase>): void {
    this.#getSelectedPhases = getSelectedPhases;
  }

  /**
   * Like ts-command-line's `ScopedCommandLineAction.parameters`, which includes the scoped parameters.
   */
  public override get parameters(): ReadonlyArray<CommandLineParameter> {
    if (this.#scopedParameters) {
      return [...super.parameters, ...this.#scopedParameters];
    } else {
      return super.parameters;
    }
  }

  public setScopedParameters(scopedParameters: ReadonlyArray<CommandLineParameter>): void {
    this.#scopedParameters = scopedParameters;
  }

  public asHeftAction(): IHeftAction {
    return this as unknown as IHeftAction;
  }
}

/**
 * Wraps an error that the full implementation would also throw, at the same point and in the same way. Such errors
 * must be propagated rather than handled by falling back to the full implementation, because evaluating some
 * definitions has side effects (for example, `HeftPhase.dependencyPhases` only throws on first access).
 */
class LeanDefinitionError {
  public readonly error: unknown;

  public constructor(error: unknown) {
    this.error = error;
  }
}

/**
 * The outcome of a command line that was fully validated and parsed by the lean implementation.
 * - 'execute': the action executes; this happens in ts-command-line's `onExecuteAsync()` stage
 * - 'print': help (or a usage error) that ts-command-line prints while parsing, before `onExecuteAsync()`
 */
type LeanInvocation =
  | {
      readonly kind: 'execute';
      readonly actionName: string;
      readonly unaliasedActionName: string;
      executeAsync(): Promise<void>;
    }
  | {
      readonly kind: 'print';
      readonly helpParser: IHelpParser;
      /**
       * If specified, the usage is printed (instead of the help), followed by this error message.
       */
      readonly usageError?: string;
    };

/**
 * Attempts to handle the command line without ts-command-line/argparse. Returns `undefined` if the lean
 * implementation cannot guarantee results identical to the full implementation, in which case nothing has been
 * modified and the caller must use the full implementation.
 */
export async function tryExecuteLeanCommandLineAsync(
  args: readonly string[],
  actionOptions: IHeftActionOptions,
  state: IHeftCommandLineParserState
): Promise<boolean | undefined> {
  let invocation: LeanInvocation | undefined;
  try {
    invocation = await tryPrepareLeanInvocationAsync(args, actionOptions);
  } catch (e) {
    if (e instanceof LeanDefinitionError) {
      throw e.error;
    }
    // Anything else is handled by the full implementation, which reports errors the canonical way.
    invocation = undefined;
  }

  if (!invocation) {
    return undefined;
  }

  if (invocation.kind === 'print') {
    // This mirrors how ts-command-line and argparse print help and usage errors
    const { formatHelp, formatUsage } = await import('./HelpFormatter');
    const { helpParser, usageError } = invocation;
    if (usageError === undefined) {
      process.stdout.write(formatHelp(helpParser));
      return true;
    } else {
      process.stdout.write(formatUsage(helpParser));
      // eslint-disable-next-line no-console
      console.error(usageError);
      return false;
    }
  }

  // This mirrors HeftFullCommandLineParser.onExecuteAsync()
  try {
    const { actionName, unaliasedActionName } = invocation;
    state.internalHeftSession.parsedCommandLine = {
      commandName: actionName,
      unaliasedCommandName: unaliasedActionName
    };
    state.childReporter?.setCommandName(actionName);
    await invocation.executeAsync();
  } catch (e) {
    await state.reportErrorAndSetExitCodeAsync(e as Error);
  }

  // If we make it here, things are fine and reset the exit code back to 0
  process.exitCode = 0;
  return true;
}

async function tryPrepareLeanInvocationAsync(
  args: readonly string[],
  actionOptions: IHeftActionOptions
): Promise<LeanInvocation | undefined> {
  const { internalHeftSession, terminal } = actionOptions;

  // Enumerate the actions in the same order as the full implementation, and bail out on anything that would
  // cause the full implementation to throw while defining them.
  const actionsByName: Map<string, ILeanActionDescriptor> = new Map();
  function tryAddAction(actionName: string, descriptor: ILeanActionDescriptor): boolean {
    if (actionsByName.has(actionName) || !ACTION_NAME_REGEXP.test(actionName)) {
      return false;
    }
    actionsByName.set(actionName, descriptor);
    return true;
  }

  tryAddAction('clean', { kind: 'clean', watch: false, summary: CLEAN_ACTION_DOCUMENTATION });
  tryAddAction('run', { kind: 'run', watch: false, summary: getRunActionDocumentation(false) });
  for (const phase of internalHeftSession.phases) {
    const { phaseName } = phase;
    const summary: string = getPhaseActionSummary(phaseName, false);
    if (!tryAddAction(phaseName, { kind: 'phase', watch: false, phase, summary })) {
      return undefined;
    }
  }
  tryAddAction('run-watch', { kind: 'run', watch: true, summary: getRunActionDocumentation(true) });
  for (const phase of internalHeftSession.phases) {
    const { phaseName } = phase;
    const summary: string = getPhaseActionSummary(phaseName, true);
    if (!tryAddAction(`${phaseName}-watch`, { kind: 'phase', watch: true, phase, summary })) {
      return undefined;
    }
  }

  const aliasSummariesByName: Map<string, string> = new Map();
  const aliasesByName: Map<string, ILeanAliasDescriptor> = new Map();
  for (const [
    aliasName,
    { actionName, defaultParameters = [] }
  ] of internalHeftSession.actionReferencesByAlias) {
    if (actionsByName.has(aliasName) || !actionsByName.has(actionName) || !ACTION_NAME_REGEXP.test(aliasName)) {
      return undefined;
    }
    // Matches ts-command-line's AliasCommandLineAction and Heft's AliasAction
    const defaultParametersString: string = defaultParameters.join(' ');
    const expandedCommand: string = `${HEFT_TOOL_FILENAME} ${actionName}${
      defaultParametersString ? ` ${defaultParametersString}` : ''
    }`;
    const summary: string = `An alias for "${expandedCommand}".`;
    aliasSummariesByName.set(aliasName, summary);
    aliasesByName.set(aliasName, {
      targetActionName: actionName,
      defaultParameters,
      documentation:
        `${summary} For more information on the aliased command, use ` +
        `"${HEFT_TOOL_FILENAME} ${actionName} --help".`,
      expansionMessage: `The "${HEFT_TOOL_FILENAME} ${aliasName}" alias was expanded to "${expandedCommand}".`
    });
  }

  const { HeftActionRunner: HeftActionRunnerClass } = await import('./HeftActionRunner');
  function createPhaseAction(
    phase: HeftPhase,
    watch: boolean
  ): { action: LeanHeftAction; actionRunner: HeftActionRunner } {
    const action: LeanHeftAction = new LeanHeftAction(`${phase.phaseName}${watch ? '-watch' : ''}`, watch);
    action.setSelectedPhasesFactory(() => getPhaseActionSelectedPhases(phase));
    const actionRunner: HeftActionRunner = new HeftActionRunnerClass({
      action: action.asHeftAction(),
      ...actionOptions
    });
    actionRunner.defineParameters();
    return { action, actionRunner };
  }

  // Define the parameters of every phase action in the same order as the full implementation does. Errors are
  // propagated, since the full implementation would throw the same error at the same point. (The watch variant
  // of a phase action defines the same parameters with the same names, so it doesn't need to be checked
  // separately. The "clean" and "run" actions only define built-in parameters.)
  const phaseActionsByPhase: Map<HeftPhase, { action: LeanHeftAction; actionRunner: HeftActionRunner }> =
    new Map();
  for (const phase of internalHeftSession.phases) {
    try {
      phaseActionsByPhase.set(phase, createPhaseAction(phase, false));
    } catch (e) {
      throw new LeanDefinitionError(e);
    }
  }

  // Ensure that registering the parameters of every phase action would succeed
  const phaseActionRegistrations: Map<LeanHeftAction, ILeanRegistration> = new Map();
  for (const { action } of phaseActionsByPhase.values()) {
    const registration: ILeanRegistration | undefined = action.tryGetRegistration(ROOT_PARAMETER_NAMES);
    if (!registration) {
      return undefined;
    }
    phaseActionRegistrations.set(action, registration);
  }

  // Process the tool-level arguments, i.e. the ones before the action name. This finds the action the same way
  // as ts-command-line does when it expands aliases.
  const actionNameIndex: number = args.findIndex((x) => !x.startsWith('-'));
  const toolArgs: readonly string[] = actionNameIndex < 0 ? args : args.slice(0, actionNameIndex);
  for (const arg of toolArgs) {
    if (arg === '-h' || arg === '--help') {
      return printRootHelp(actionsByName, aliasSummariesByName);
    } else if (arg !== Constants.debugParameterLongName && arg !== Constants.unmanagedParameterLongName) {
      if (actionNameIndex >= 0 || !isUnrecognizedToolOption(arg)) {
        return undefined;
      }
      // argparse only reports unrecognized arguments after parsing succeeded, which it can't without an action
    }
  }

  if (actionNameIndex < 0) {
    if (args.length === 0) {
      // ts-command-line prints the help if no arguments are provided
      return printRootHelp(actionsByName, aliasSummariesByName);
    }
    // argparse: the required <command> positional is missing
    return {
      kind: 'print',
      helpParser: getRootHelpParser(getActionSummaries(actionsByName, aliasSummariesByName)),
      usageError: `${HEFT_TOOL_FILENAME}: error: too few arguments\n`
    };
  }

  // The action name as specified on the command line, which may be an alias
  const actionName: string = args[actionNameIndex];
  const alias: ILeanAliasDescriptor | undefined = aliasesByName.get(actionName);
  const unaliasedActionName: string = alias ? alias.targetActionName : actionName;
  const descriptor: ILeanActionDescriptor | undefined = actionsByName.get(unaliasedActionName);
  if (!descriptor) {
    return undefined;
  }

  // Like ts-command-line, insert the alias's default parameters after the alias name. The parser of an alias
  // registers the same parameters (and thus option strings) as the parser of its target action.
  const actionArgs: readonly string[] = alias
    ? [...alias.defaultParameters, ...args.slice(actionNameIndex + 1)]
    : args.slice(actionNameIndex + 1);
  const actionProg: string = `${HEFT_TOOL_FILENAME} ${actionName}`;
  const unaliasedActionProg: string = `${HEFT_TOOL_FILENAME} ${unaliasedActionName}`;
  function createExecuteInvocation(executeAsync: () => Promise<void>): LeanInvocation {
    return {
      kind: 'execute',
      actionName,
      unaliasedActionName,
      executeAsync: alias
        ? async () => {
            // This mirrors Heft's AliasAction
            terminal.writeLine(alias.expansionMessage);
            await executeAsync();
          }
        : executeAsync
    };
  }

  switch (descriptor.kind) {
    case 'phase': {
      const phase: HeftPhase = descriptor.phase!;
      // The non-watch variant of the phase action was already created above
      const { action, actionRunner } = descriptor.watch
        ? createPhaseAction(phase, true)
        : phaseActionsByPhase.get(phase)!;
      const registration: ILeanRegistration | undefined =
        phaseActionRegistrations.get(action) ?? action.tryGetRegistration(ROOT_PARAMETER_NAMES);
      const parseResult: LeanParseResult | undefined = tryParseAndApply(action, registration, actionArgs, false);
      if (parseResult?.kind === 'help') {
        const documentation: string =
          alias?.documentation ??
          getPhaseActionDocumentation(phase.phaseName, phase.phaseDescription, descriptor.watch);
        return printHelp(action.getHelpParser(registration!, actionProg, documentation, undefined));
      } else if (parseResult?.kind !== 'ok') {
        return undefined;
      }

      return createExecuteInvocation(() => actionRunner.executeAsync());
    }

    case 'run': {
      const documentation: string = getRunActionDocumentation(descriptor.watch);
      const action: LeanHeftAction = new LeanHeftAction(unaliasedActionName, descriptor.watch);
      action.defineCommandLineRemainder({ description: SCOPED_ACTION_REMAINDER_DESCRIPTION });
      const scopingParameters: IScopingParameters = definePhaseScopingParameters(action);
      action.setSelectedPhasesFactory(() =>
        expandPhases(
          scopingParameters.onlyParameter,
          scopingParameters.toParameter,
          scopingParameters.toExceptParameter,
          internalHeftSession,
          terminal
        )
      );
      const actionRunner: HeftActionRunner = new HeftActionRunnerClass({
        action: action.asHeftAction(),
        ...actionOptions
      });

      const registration: ILeanRegistration | undefined = action.tryGetRegistration(ROOT_PARAMETER_NAMES);
      const parseResult: LeanParseResult | undefined = tryParseAndApply(action, registration, actionArgs, true);
      if (parseResult?.kind === 'help') {
        return printHelp(
          action.getHelpParser(registration!, actionProg, alias?.documentation ?? documentation, undefined)
        );
      } else if (parseResult?.kind !== 'ok') {
        return undefined;
      }

      // Evaluate the phase selection now, but only if doing so cannot report an error
      for (const scopingParameter of [
        scopingParameters.onlyParameter,
        scopingParameters.toParameter,
        scopingParameters.toExceptParameter
      ]) {
        for (const phaseName of scopingParameter.values) {
          if (!internalHeftSession.phasesByName.has(phaseName)) {
            return undefined;
          }
        }
      }
      try {
        // Throws if the selection is empty
        if (action.selectedPhases.size === 0) {
          return undefined;
        }
      } catch (e) {
        return undefined;
      }

      // Define the scoped parameters, like ScopedCommandLineAction does
      const scopedParameterProvider: LeanParameterProvider = new LeanParameterProvider();
      actionRunner.defineParameters(scopedParameterProvider.asCommandLineParameterProvider());
      const scopedRegistration: ILeanRegistration | undefined = scopedParameterProvider.tryGetRegistration([
        ...ROOT_PARAMETER_NAMES,
        ...registration!.registeredNames
      ]);

      // ScopedCommandLineAction requires the remainder to start with "--", which is then discarded
      const remainder: readonly string[] = parseResult.remainder ?? [];
      if (remainder.length && remainder[0] !== '--') {
        return undefined;
      }
      const scopedParseResult: LeanParseResult | undefined = tryParseAndApply(
        scopedParameterProvider,
        scopedRegistration,
        remainder.slice(1),
        false
      );
      if (scopedParseResult?.kind === 'help') {
        // ScopedCommandLineAction parses the scoped parameters (and prints their help) during execution. The
        // scoping arguments are omitted from the help of an alias, since they don't apply to the alias itself.
        const scopingArgs: string[] = [];
        for (const parameter of action.parameters) {
          parameter.appendToArgList(scopingArgs);
        }
        const scope: string = scopingArgs.join(' ');
        const scopedHelpParser: IHelpParser = scopedParameterProvider.getHelpParser(
          scopedRegistration!,
          `${actionProg}${scope && !alias ? ` ${scope} --` : ''}`,
          alias?.documentation ?? documentation,
          Colorize.bold(
            `For more information on available unscoped parameters, use "${unaliasedActionProg} --help"`
          )
        );
        return createExecuteInvocation(async () => {
          const { formatHelp } = await import('./HelpFormatter');
          process.stdout.write(formatHelp(scopedHelpParser));
        });
      } else if (scopedParseResult?.kind !== 'ok') {
        return undefined;
      }
      action.setScopedParameters(scopedParameterProvider.parameters);

      return createExecuteInvocation(() => actionRunner.executeAsync());
    }

    case 'clean': {
      const action: LeanHeftAction = new LeanHeftAction(unaliasedActionName, false);
      const scopingParameters: IScopingParameters = definePhaseScopingParameters(action);
      action.setSelectedPhasesFactory(() =>
        getCleanSelectedPhases(scopingParameters, internalHeftSession, terminal)
      );
      const verboseFlag: CommandLineFlagParameter = action.defineFlagParameter({
        parameterLongName: Constants.verboseParameterLongName,
        parameterShortName: Constants.verboseParameterShortName,
        description: VERBOSE_PARAMETER_DESCRIPTION
      });

      const registration: ILeanRegistration | undefined = action.tryGetRegistration(ROOT_PARAMETER_NAMES);
      const parseResult: LeanParseResult | undefined = tryParseAndApply(action, registration, actionArgs, false);
      if (parseResult?.kind === 'help') {
        return printHelp(
          action.getHelpParser(
            registration!,
            actionProg,
            alias?.documentation ?? CLEAN_ACTION_DOCUMENTATION,
            undefined
          )
        );
      } else if (parseResult?.kind !== 'ok') {
        return undefined;
      }

      return createExecuteInvocation(async () => {
        const { executeCleanActionAsync } = await import('./actions/CleanActionExecution');
        await executeCleanActionAsync({
          action: action.asHeftAction(),
          internalHeftSession,
          terminal,
          metricsCollector: actionOptions.metricsCollector,
          isVerbose: verboseFlag.value
        });
      });
    }

    default:
      return undefined;
  }
}

/**
 * Parses the arguments and, if successful, assigns the parameter values. Returns `undefined` if the full
 * implementation must be used instead.
 */
function tryParseAndApply(
  provider: LeanParameterProvider,
  registration: ILeanRegistration | undefined,
  args: readonly string[],
  allowRemainder: boolean
): LeanParseResult | undefined {
  if (!registration) {
    return undefined;
  }

  const result: LeanParseResult = provider.parseArguments(registration, args, allowRemainder);
  if (result.kind === 'ok') {
    if (!provider.tryApplyValues(result.data, allowRemainder ? result.remainder ?? [] : undefined)) {
      return undefined;
    }
  }

  return result;
}

/**
 * Returns true if argparse would treat the argument as an unrecognized option of Heft's root parser, i.e. it is
 * not a prefix of any of the root parser's option strings.
 */
function isUnrecognizedToolOption(arg: string): boolean {
  if (!PLAIN_LONG_OPTION_REGEXP.test(arg)) {
    return false;
  }
  for (const optionString of [...HELP_ACTION.optionStrings, ...ROOT_PARAMETER_NAMES]) {
    if (optionString.startsWith(arg)) {
      return false;
    }
  }
  return true;
}

function printHelp(helpParser: IHelpParser): LeanInvocation {
  return { kind: 'print', helpParser };
}

function printRootHelp(
  actionsByName: ReadonlyMap<string, ILeanActionDescriptor>,
  aliasSummariesByName: ReadonlyMap<string, string>
): LeanInvocation {
  return printHelp(getRootHelpParser(getActionSummaries(actionsByName, aliasSummariesByName)));
}

function* getActionSummaries(
  actionsByName: ReadonlyMap<string, ILeanActionDescriptor>,
  aliasSummariesByName: ReadonlyMap<string, string>
): IterableIterator<[string, string]> {
  for (const [actionName, { summary }] of actionsByName) {
    yield [actionName, summary];
  }
  yield* aliasSummariesByName;
}

/**
 * Models the argparse parser that ts-command-line builds for Heft's root command line.
 *
 * @param actionSummaries - the name and summary of each action, in the order in which they were added
 */
export function getRootHelpParser(actionSummaries: Iterable<[string, string]>): IHelpParser {
  const subactions: IHelpAction[] = [];
  for (const [actionName, summary] of actionSummaries) {
    subactions.push({
      optionStrings: [],
      dest: actionName,
      help: summary
    });
  }

  const subparsersAction: IHelpAction = {
    optionStrings: [],
    dest: 'action',
    nargs: PARSER,
    metavar: '<command>',
    subactions
  };
  const debugAction: IHelpAction = {
    optionStrings: [Constants.debugParameterLongName],
    dest: 'debug',
    nargs: 0,
    help: DEBUG_PARAMETER_DESCRIPTION
  };
  const unmanagedAction: IHelpAction = {
    optionStrings: [Constants.unmanagedParameterLongName],
    dest: 'unmanaged',
    nargs: 0,
    help: UNMANAGED_PARAMETER_DESCRIPTION
  };

  return {
    prog: HEFT_TOOL_FILENAME,
    description: HEFT_TOOL_DESCRIPTION,
    epilog: Colorize.bold(`For detailed help about a specific command, use: ${HEFT_TOOL_FILENAME} <command> -h`),
    // ts-command-line adds the actions (and thus the subparsers) before it registers the tool's own parameters
    actions: [HELP_ACTION, subparsersAction, debugAction, unmanagedAction],
    groups: [
      { title: 'Positional arguments', actions: [subparsersAction] },
      { title: 'Optional arguments', actions: [HELP_ACTION, debugAction, unmanagedAction] }
    ]
  };
}
