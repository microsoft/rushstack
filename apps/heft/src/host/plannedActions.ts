import type { CommandLineParameter as PublicCommandLineParameter } from '@rushstack/ts-command-line';
import type { CommandLineParameter } from '@rushstack/ts-command-line/lib/parameters/BaseClasses';

import { LeanParameterProvider } from '../cli/LeanParameterProvider';
import type { IHeftAction, IHeftActionOptions } from '../cli/actions/IHeftAction';
import type { HeftPhase } from '../pluginFramework/HeftPhase';
import type { IHeftConfigurationJsonActionReference } from '../utilities/CoreConfigFiles';
import type { HostPlanParameterValue, IHostPlanCommand } from './HostPlan';

const HEFT_TOOL_FILENAME: 'heft' = 'heft';

export class HostHeftAction extends LeanParameterProvider {
  public readonly actionName: string;
  public readonly watch: boolean;
  #getSelectedPhases: (() => ReadonlySet<HeftPhase>) | undefined;
  #selectedPhases: ReadonlySet<HeftPhase> | undefined;
  #scopedParameters: ReadonlyArray<PublicCommandLineParameter> | undefined;

  public constructor(actionName: string, watch: boolean) {
    super();
    this.actionName = actionName;
    this.watch = watch;
  }

  public get selectedPhases(): ReadonlySet<HeftPhase> {
    if (!this.#selectedPhases) {
      this.#selectedPhases = this.#getSelectedPhases!();
    }
    return this.#selectedPhases;
  }

  public setSelectedPhasesFactory(getSelectedPhases: () => ReadonlySet<HeftPhase>): void {
    this.#getSelectedPhases = getSelectedPhases;
  }

  public override get parameters(): ReadonlyArray<PublicCommandLineParameter> {
    if (this.#scopedParameters) {
      return [...super.parameters, ...this.#scopedParameters];
    } else {
      return super.parameters;
    }
  }

  public setScopedParameters(scopedParameters: ReadonlyArray<PublicCommandLineParameter>): void {
    this.#scopedParameters = scopedParameters;
  }

  public asHeftAction(): IHeftAction {
    return this as unknown as IHeftAction;
  }
}

export function selectPhaseAndItsDependencies(phase: HeftPhase): Set<HeftPhase> {
  const selectedPhases: Set<HeftPhase> = new Set([phase]);
  for (const selectedPhase of selectedPhases) {
    for (const dependencyPhase of selectedPhase.dependencyPhases) {
      selectedPhases.add(dependencyPhase);
    }
  }
  return selectedPhases;
}

export function tryApplyPlannedParameterValues(
  parameterProvider: LeanParameterProvider,
  plannedValues: ReadonlyArray<HostPlanParameterValue>,
  remainder?: ReadonlyArray<string>
): boolean {
  const definedParameters: ReadonlyArray<CommandLineParameter> =
    parameterProvider.parameters as unknown as ReadonlyArray<CommandLineParameter>;
  if (definedParameters.length !== plannedValues.length) {
    return false;
  }
  const dataByParameter: Map<CommandLineParameter, unknown> = new Map();
  for (let parameterIndex: number = 0; parameterIndex < definedParameters.length; parameterIndex++) {
    const definedParameter: CommandLineParameter = definedParameters[parameterIndex];
    const [parameterName, data] = plannedValues[parameterIndex];
    if ((definedParameter.scopedLongName ?? definedParameter.longName) !== parameterName) {
      return false;
    }
    if (data !== null && data !== undefined) {
      dataByParameter.set(definedParameter, data);
    }
  }
  return parameterProvider.tryApplyValues(dataByParameter, remainder && [...remainder]);
}

function getAliasExpansionMessage(
  aliasName: string,
  actionReference: IHeftConfigurationJsonActionReference
): string {
  const defaultParametersString: string = (actionReference.defaultParameters ?? []).join(' ');
  const expandedCommand: string = `${HEFT_TOOL_FILENAME} ${actionReference.actionName}${
    defaultParametersString ? ` ${defaultParametersString}` : ''
  }`;
  return `The "${HEFT_TOOL_FILENAME} ${aliasName}" alias was expanded to "${expandedCommand}".`;
}

export function tryGetAliasExpansionMessage(
  command: IHostPlanCommand,
  actionOptions: IHeftActionOptions
): string | false | undefined {
  if (command.commandName === command.unaliasedCommandName) {
    return undefined;
  }
  const actionReference: IHeftConfigurationJsonActionReference | undefined =
    actionOptions.internalHeftSession.actionReferencesByAlias.get(command.commandName);
  if (actionReference?.actionName !== command.unaliasedCommandName) {
    return false;
  }
  const aliasExpansionMessage: string = getAliasExpansionMessage(command.commandName, actionReference);
  if (
    command.aliasExpansionMessage !== undefined &&
    command.aliasExpansionMessage !== aliasExpansionMessage
  ) {
    return false;
  }
  return aliasExpansionMessage;
}
