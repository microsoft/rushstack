// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * "baseCommand" from command-line.schema.json
 */
export interface IBaseCommandJson {
  commandKind: 'bulk' | 'global' | 'phased';
  name: string;
  summary: string;
  /**
   * If omitted, the summary will be used instead.
   */
  description?: string;
  safeForSimultaneousRushProcesses: boolean;
  autoinstallerName?: string;
  shellCommand?: string;
}

/**
 * "bulkCommand" from command-line.schema.json
 */
export interface IBulkCommandJson extends IBaseCommandJson {
  commandKind: 'bulk';
  enableParallelism: boolean;
  ignoreDependencyOrder?: boolean;
  ignoreMissingScript?: boolean;
  incremental?: boolean;
  allowWarningsInSuccessfulBuild?: boolean;
  watchForChanges?: boolean;
  disableBuildCache?: boolean;
}

/**
 * Base interface shared by the "phasedCommand" JSON entries and the post-processed
 * "IPhase" interface in the CommandLineConfiguration
 */
export interface IPhasedCommandWithoutPhasesJson extends IBaseCommandJson {
  commandKind: 'phased';
  enableParallelism: boolean;
  incremental?: boolean;
}

/**
 * "phasedCommand" from command-line.schema.json
 */
export interface IPhasedCommandJson extends IPhasedCommandWithoutPhasesJson {
  phases: string[];
  watchOptions?: {
    alwaysWatch: boolean;
    debounceMs?: number;
    watchPhases: string[];
    includeAllProjectsInWatchGraph?: boolean;
  };
  installOptions?: {
    alwaysInstall: boolean;
  };
}

/**
 * "globalCommand" from command-line.schema.json
 */
export interface IGlobalCommandJson extends IBaseCommandJson {
  commandKind: 'global';
  shellCommand: string;
}

export type CommandJson = IBulkCommandJson | IGlobalCommandJson | IPhasedCommandJson;

/**
 * The dependencies of a phase.
 * @alpha
 */
export interface IPhaseDependencies {
  /**
   * Dependency phases within the same project.
   */
  self?: string[];
  /**
   * Dependency phases in upstream projects.
   */
  upstream?: string[];
}

/**
 * A phase, used in the phased command feature.
 * @alpha
 */
export interface IPhaseJson {
  /**
   * The name of the phase. Note that this value must start with the \"_phase:\" prefix.
   */
  name: string;
  /**
   * The dependencies of this phase.
   */
  dependencies?: IPhaseDependencies;
  /**
   * Normally Rush requires that each project's package.json has a \"scripts\" entry matching the phase name. To disable this check, set \"ignoreMissingScript\" to true.
   */
  ignoreMissingScript?: boolean;
  /**
   * What should happen if the script is not defined in a project's package.json scripts field. Default is "error". Supersedes \"ignoreMissingScript\".
   */
  missingScriptBehavior?: 'silent' | 'log' | 'error';
  /**
   * By default, Rush returns a nonzero exit code if errors or warnings occur during a command. If this option is set to \"true\", Rush will return a zero exit code if warnings occur during the execution of this phase.
   */
  allowWarningsOnSuccess?: boolean;
}

/**
 * "baseParameter" from command-line.schema.json
 * @public
 */
export interface IBaseParameterJson {
  /**
   * Indicates the kind of syntax for this command-line parameter: \"flag\" or \"choice\" or \"string\" or \"stringList\" or \"integerList\" or \"choiceList\".
   */
  parameterKind: 'flag' | 'choice' | 'string' | 'integer' | 'stringList' | 'integerList' | 'choiceList';
  /**
   * The name of the parameter (e.g. \"--verbose\").  This is a required field.
   */
  longName: string;
  /**
   * An optional short form of the parameter (e.g. \"-v\" instead of \"--verbose\").
   */
  shortName?: string;
  /**
   * A detailed description of the parameter, which appears when requesting help for the command (e.g. \"rush --help my-command\").
   */
  description: string;
  /**
   * A list of custom commands and/or built-in Rush commands that this parameter may be used with, by name.
   */
  associatedCommands?: string[];
  /**
   * A list of the names of the phases that this command-line parameter should be provided to.
   */
  associatedPhases?: string[];
  /**
   * If true, then this parameter must be included on the command line.
   */
  required?: boolean;
}

/**
 * A custom command-line parameter whose presence acts as an on/off switch.
 * @public
 */
export interface IFlagParameterJson extends IBaseParameterJson {
  /**
   * Denotes that this is a flag (boolean) parameter.
   */
  parameterKind: 'flag';
}

/**
 * Part of "choiceParameter" from command-line.schema.json
 * @public
 */
export interface IChoiceParameterAlternativeJson {
  /**
   * A token that is one of the alternatives that can be used with the choice parameter, e.g. \"vanilla\" in \"--flavor vanilla\".
   */
  name: string;
  /**
   * A detailed description for the alternative that will be shown in the command-line help.
   */
  description: string;
}

/**
 * A custom command-line parameter whose argument must be chosen from a list of allowable alternatives.
 * @public
 */
export interface IChoiceParameterJson extends IBaseParameterJson {
  /**
   * Denotes that this is a choice parameter.
   */
  parameterKind: 'choice';
  /**
   * A list of alternative argument values that can be chosen for this parameter.
   */
  alternatives: IChoiceParameterAlternativeJson[];
  /**
   * If the parameter is omitted from the command line, this value will be inserted by default.
   */
  defaultValue?: string;
}

/**
 * A custom command-line parameter whose value is interpreted as a string.
 * @public
 */
export interface IStringParameterJson extends IBaseParameterJson {
  /**
   * Denotes that this is a string parameter.
   */
  parameterKind: 'string';
  /**
   * The name of the argument for this parameter.
   */
  argumentName: string;
}
/**
 * A custom command-line parameter whose value is interpreted as a integer.
 * @public
 */
export interface IIntegerParameterJson extends IBaseParameterJson {
  /**
   * Denotes that this is a string parameter.
   */
  parameterKind: 'integer';
  /**
   * The name of the argument for this parameter.
   */
  argumentName: string;
}

/**
 * A custom command-line parameter whose presence acts as a list of string
 * @public
 */
export interface IStringListParameterJson extends IBaseParameterJson {
  /**
   * Denotes that this is a string list parameter.
   */
  parameterKind: 'stringList';
  /**
   * The name of the argument for this parameter.
   */
  argumentName: string;
}
/**
 * A custom command-line parameter whose presence acts as a list of integer
 * @public
 */
export interface IIntegerListParameterJson extends IBaseParameterJson {
  /**
   * Denotes that this is a integer list parameter.
   */
  parameterKind: 'integerList';
  /**
   * The name of the argument for this parameter.
   */
  argumentName: string;
}
/**
 * A custom command-line parameter whose presence acts as a list of choice
 * @public
 */
export interface IChoiceListParameterJson extends IBaseParameterJson {
  /**
   * Denotes that this is a choice list parameter.
   */
  parameterKind: 'choiceList';
  /**
   * A list of alternative argument values that can be chosen for this parameter.
   */
  alternatives: IChoiceParameterAlternativeJson[];
}

export type ParameterJson =
  | IFlagParameterJson
  | IChoiceParameterJson
  | IStringParameterJson
  | IIntegerParameterJson
  | IStringListParameterJson
  | IIntegerListParameterJson
  | IChoiceListParameterJson;

/**
 * Interfaces for the file format described by command-line.schema.json
 */
export interface ICommandLineJson {
  commands?: CommandJson[];
  phases?: IPhaseJson[];
  parameters?: ParameterJson[];
}
