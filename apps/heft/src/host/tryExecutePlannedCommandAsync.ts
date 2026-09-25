import type { HeftActionRunner } from '../cli/HeftActionRunner';
import type { IHeftActionOptions } from '../cli/actions/IHeftAction';
import type { IHeftCommandLineParserState } from '../cli/HeftCommandLineParser';
import type { IScopingParameters } from '../cli/actions/PhaseScoping';
import { LeanParameterProvider } from '../cli/LeanParameterProvider';
import type { HeftPhase } from '../pluginFramework/HeftPhase';
import type { IHostPlanCommand } from './HostPlan';
import { makeRequireStacksMatchTheHeftCommandLine } from './makeRequireStacksMatchTheHeftCommandLine';
import {
  HostHeftAction,
  selectPhaseAndItsDependencies,
  tryApplyPlannedParameterValues,
  tryGetAliasExpansionMessage
} from './plannedActions';

async function createActionRunnerAsync(
  action: HostHeftAction,
  actionOptions: IHeftActionOptions
): Promise<HeftActionRunner> {
  const { HeftActionRunner: HeftActionRunnerClass } = await import('../cli/HeftActionRunner');
  return new HeftActionRunnerClass({ action: action.asHeftAction(), ...actionOptions });
}

async function tryPreparePlannedPhaseActionAsync(
  command: IHostPlanCommand,
  actionOptions: IHeftActionOptions
): Promise<HeftActionRunner | undefined> {
  const phase: HeftPhase | undefined =
    command.phaseName === undefined
      ? undefined
      : actionOptions.internalHeftSession.phasesByName.get(command.phaseName);
  if (!phase || command.unaliasedCommandName !== `${phase.phaseName}${command.watch ? '-watch' : ''}`) {
    return undefined;
  }
  const action: HostHeftAction = new HostHeftAction(command.unaliasedCommandName, command.watch);
  action.setSelectedPhasesFactory(() => selectPhaseAndItsDependencies(phase));
  const actionRunner: HeftActionRunner = await createActionRunnerAsync(action, actionOptions);
  actionRunner.defineParameters();
  return tryApplyPlannedParameterValues(action, command.values) ? actionRunner : undefined;
}

function tryEvaluateSelectedPhases(
  action: HostHeftAction,
  scopingParameters: IScopingParameters,
  actionOptions: IHeftActionOptions
): boolean {
  const { phasesByName } = actionOptions.internalHeftSession;
  const { onlyParameter, toParameter, toExceptParameter } = scopingParameters;
  for (const scopingParameter of [onlyParameter, toParameter, toExceptParameter]) {
    for (const phaseName of scopingParameter.values) {
      if (!phasesByName.has(phaseName)) {
        return false;
      }
    }
  }
  try {
    return action.selectedPhases.size !== 0;
  } catch {
    return false;
  }
}

async function tryPreparePlannedRunActionAsync(
  command: IHostPlanCommand,
  actionOptions: IHeftActionOptions
): Promise<HeftActionRunner | undefined> {
  if (command.unaliasedCommandName !== (command.watch ? 'run-watch' : 'run')) {
    return undefined;
  }
  const { internalHeftSession, terminal } = actionOptions;
  const { definePhaseScopingParameters, expandPhases } = await import('../cli/actions/PhaseScoping');
  const { SCOPED_ACTION_REMAINDER_DESCRIPTION } = await import('../cli/CliConstants');
  const action: HostHeftAction = new HostHeftAction(command.unaliasedCommandName, command.watch);
  action.defineCommandLineRemainder({ description: SCOPED_ACTION_REMAINDER_DESCRIPTION });
  const scopingParameters: IScopingParameters = definePhaseScopingParameters(action);
  const { onlyParameter, toParameter, toExceptParameter } = scopingParameters;
  action.setSelectedPhasesFactory(() =>
    expandPhases(onlyParameter, toParameter, toExceptParameter, internalHeftSession, terminal)
  );
  const actionRunner: HeftActionRunner = await createActionRunnerAsync(action, actionOptions);
  const remainder: ReadonlyArray<string> = command.remainder ?? [];
  if (
    !tryApplyPlannedParameterValues(action, command.values, remainder) ||
    !tryEvaluateSelectedPhases(action, scopingParameters, actionOptions)
  ) {
    return undefined;
  }
  const scopedParameterProvider: LeanParameterProvider = new LeanParameterProvider();
  actionRunner.defineParameters(scopedParameterProvider.asCommandLineParameterProvider());
  if (
    (remainder.length && remainder[0] !== '--') ||
    !tryApplyPlannedParameterValues(scopedParameterProvider, command.scopedValues ?? [])
  ) {
    return undefined;
  }
  action.setScopedParameters(scopedParameterProvider.parameters);
  return actionRunner;
}

export async function tryExecutePlannedCommandAsync(
  command: IHostPlanCommand,
  actionOptions: IHeftActionOptions,
  state: IHeftCommandLineParserState
): Promise<boolean | undefined> {
  const aliasExpansionMessage: string | false | undefined = tryGetAliasExpansionMessage(
    command,
    actionOptions
  );
  if (aliasExpansionMessage === false) {
    return undefined;
  }
  const actionRunner: HeftActionRunner | undefined =
    command.actionKind === 'phase'
      ? await tryPreparePlannedPhaseActionAsync(command, actionOptions)
      : command.actionKind === 'run'
        ? await tryPreparePlannedRunActionAsync(command, actionOptions)
        : undefined;
  if (!actionRunner) {
    return undefined;
  }
  makeRequireStacksMatchTheHeftCommandLine();

  try {
    state.internalHeftSession.parsedCommandLine = {
      commandName: command.commandName,
      unaliasedCommandName: command.unaliasedCommandName
    };
    state.childReporter?.setCommandName(command.commandName);
    if (aliasExpansionMessage) {
      actionOptions.terminal.writeLine(aliasExpansionMessage);
    }
    await actionRunner.executeAsync();
  } catch (error) {
    await state.reportErrorAndSetExitCodeAsync(error as Error);
  }

  process.exitCode = 0;
  return true;
}
