// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AlreadyReportedError } from '@rushstack/node-core-library';
import { Colorize, type ITerminal } from '@rushstack/terminal';
import type {
  CommandLineParameterProvider,
  CommandLineStringListParameter,
  CommandLineStringParameter
} from '@rushstack/ts-command-line';

import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { Selection } from '../../logic/Selection';
import type { ISelectorParser as ISelectorParser } from '../../logic/selectors/ISelectorParser';
import {
  GitChangedProjectSelectorParser,
  type IGitSelectorParserOptions
} from '../../logic/selectors/GitChangedProjectSelectorParser';
import { NamedProjectSelectorParser } from '../../logic/selectors/NamedProjectSelectorParser';
import { TagProjectSelectorParser } from '../../logic/selectors/TagProjectSelectorParser';
import { VersionPolicyProjectSelectorParser } from '../../logic/selectors/VersionPolicyProjectSelectorParser';
import { SubspaceSelectorParser } from '../../logic/selectors/SubspaceSelectorParser';
import { PathProjectSelectorParser } from '../../logic/selectors/PathProjectSelectorParser';
import type { Subspace } from '../../api/Subspace';

export const SUBSPACE_LONG_ARG_NAME: '--subspace' = '--subspace';

interface ISelectionParameterSetOptions {
  gitOptions: IGitSelectorParserOptions;
  includeSubspaceSelector: boolean;
  /**
   * The working directory used to resolve relative paths.
   * This should be the same directory that was used to find the Rush configuration.
   */
  cwd: string;
}

/**
 * This class is provides the set of command line parameters used to select projects
 * based on dependencies.
 *
 * It is a separate component such that unrelated actions can share the same parameters.
 */
export class SelectionParameterSet {
  readonly #rushConfiguration: RushConfiguration;

  readonly #fromProject: CommandLineStringListParameter;
  readonly #impactedByProject: CommandLineStringListParameter;
  readonly #impactedByExceptProject: CommandLineStringListParameter;
  readonly #onlyProject: CommandLineStringListParameter;
  readonly #toProject: CommandLineStringListParameter;
  readonly #toExceptProject: CommandLineStringListParameter;
  readonly #subspaceParameter: CommandLineStringParameter | undefined;

  readonly #fromVersionPolicy: CommandLineStringListParameter;
  readonly #toVersionPolicy: CommandLineStringListParameter;

  readonly #selectorParserByScope: Map<string, ISelectorParser<RushConfigurationProject>>;

  public constructor(
    rushConfiguration: RushConfiguration,
    action: CommandLineParameterProvider,
    options: ISelectionParameterSetOptions
  ) {
    const { gitOptions, includeSubspaceSelector, cwd } = options;
    this.#rushConfiguration = rushConfiguration;

    const selectorParsers: Map<string, ISelectorParser<RushConfigurationProject>> = new Map<
      string,
      ISelectorParser<RushConfigurationProject>
    >();

    const nameSelectorParser: NamedProjectSelectorParser = new NamedProjectSelectorParser(rushConfiguration);
    selectorParsers.set('name', nameSelectorParser);
    selectorParsers.set('git', new GitChangedProjectSelectorParser(rushConfiguration, gitOptions));
    selectorParsers.set('tag', new TagProjectSelectorParser(rushConfiguration));
    selectorParsers.set('version-policy', new VersionPolicyProjectSelectorParser(rushConfiguration));
    selectorParsers.set('subspace', new SubspaceSelectorParser(rushConfiguration));
    selectorParsers.set('path', new PathProjectSelectorParser(rushConfiguration, cwd));

    this.#selectorParserByScope = selectorParsers;

    const getCompletionsAsync: () => Promise<string[]> = async (): Promise<string[]> => {
      const completions: string[] = ['.'];
      for (const [prefix, selector] of selectorParsers) {
        for (const completion of selector.getCompletions()) {
          completions.push(`${prefix}:${completion}`);
        }
      }

      // Include completions from the name parser without a scope
      for (const completion of nameSelectorParser.getCompletions()) {
        completions.push(completion);
      }

      return completions;
    };

    this.#toProject = action.defineStringListParameter({
      parameterLongName: '--to',
      parameterShortName: '-t',
      argumentName: 'PROJECT',
      description:
        'Normally all projects in the monorepo will be processed;' +
        ' adding this parameter will instead select a subset of projects.' +
        ' Each "--to" parameter expands this selection to include PROJECT and all its dependencies.' +
        ' "." can be used as shorthand for the project in the current working directory.' +
        ' For details, refer to the website article "Selecting subsets of projects".',
      getCompletionsAsync
    });
    this.#toExceptProject = action.defineStringListParameter({
      parameterLongName: '--to-except',
      parameterShortName: '-T',
      argumentName: 'PROJECT',
      description:
        'Normally all projects in the monorepo will be processed;' +
        ' adding this parameter will instead select a subset of projects.' +
        ' Each "--to-except" parameter expands this selection to include all dependencies of PROJECT,' +
        ' but not PROJECT itself.' +
        ' "." can be used as shorthand for the project in the current working directory.' +
        ' For details, refer to the website article "Selecting subsets of projects".',
      getCompletionsAsync
    });

    this.#fromProject = action.defineStringListParameter({
      parameterLongName: '--from',
      parameterShortName: '-f',
      argumentName: 'PROJECT',
      description:
        'Normally all projects in the monorepo will be processed;' +
        ' adding this parameter will instead select a subset of projects.' +
        ' Each "--from" parameter expands this selection to include PROJECT and all projects that depend on it,' +
        ' plus all dependencies of this set.' +
        ' "." can be used as shorthand for the project in the current working directory.' +
        ' For details, refer to the website article "Selecting subsets of projects".',
      getCompletionsAsync
    });
    this.#onlyProject = action.defineStringListParameter({
      parameterLongName: '--only',
      parameterShortName: '-o',
      argumentName: 'PROJECT',
      description:
        'Normally all projects in the monorepo will be processed;' +
        ' adding this parameter will instead select a subset of projects.' +
        ' Each "--only" parameter expands this selection to include PROJECT; its dependencies are not added.' +
        ' "." can be used as shorthand for the project in the current working directory.' +
        ' Note that this parameter is "unsafe" as it may produce a selection that excludes some dependencies.' +
        ' For details, refer to the website article "Selecting subsets of projects".',
      getCompletionsAsync
    });

    this.#impactedByProject = action.defineStringListParameter({
      parameterLongName: '--impacted-by',
      parameterShortName: '-i',
      argumentName: 'PROJECT',
      description:
        'Normally all projects in the monorepo will be processed;' +
        ' adding this parameter will instead select a subset of projects.' +
        ' Each "--impacted-by" parameter expands this selection to include PROJECT and any projects that' +
        ' depend on PROJECT (and thus might be broken by changes to PROJECT).' +
        ' "." can be used as shorthand for the project in the current working directory.' +
        ' Note that this parameter is "unsafe" as it may produce a selection that excludes some dependencies.' +
        ' For details, refer to the website article "Selecting subsets of projects".',
      getCompletionsAsync
    });

    this.#impactedByExceptProject = action.defineStringListParameter({
      parameterLongName: '--impacted-by-except',
      parameterShortName: '-I',
      argumentName: 'PROJECT',
      description:
        'Normally all projects in the monorepo will be processed;' +
        ' adding this parameter will instead select a subset of projects.' +
        ' Each "--impacted-by-except" parameter works the same as "--impacted-by" except that PROJECT itself' +
        ' is not added to the selection.' +
        ' "." can be used as shorthand for the project in the current working directory.' +
        ' Note that this parameter is "unsafe" as it may produce a selection that excludes some dependencies.' +
        ' For details, refer to the website article "Selecting subsets of projects".',
      getCompletionsAsync
    });

    this.#toVersionPolicy = action.defineStringListParameter({
      parameterLongName: '--to-version-policy',
      argumentName: 'VERSION_POLICY_NAME',
      description:
        'Normally all projects in the monorepo will be processed;' +
        ' adding this parameter will instead select a subset of projects.' +
        ' The "--to-version-policy" parameter is equivalent to specifying "--to" for each of the projects' +
        ' belonging to VERSION_POLICY_NAME.' +
        ' For details, refer to the website article "Selecting subsets of projects".'
    });
    this.#fromVersionPolicy = action.defineStringListParameter({
      parameterLongName: '--from-version-policy',
      argumentName: 'VERSION_POLICY_NAME',
      description:
        'Normally all projects in the monorepo will be processed;' +
        ' adding this parameter will instead select a subset of projects.' +
        ' The "--from-version-policy" parameter is equivalent to specifying "--from" for each of the projects' +
        ' belonging to VERSION_POLICY_NAME.' +
        ' For details, refer to the website article "Selecting subsets of projects".'
    });

    if (includeSubspaceSelector) {
      this.#subspaceParameter = action.defineStringParameter({
        parameterLongName: SUBSPACE_LONG_ARG_NAME,
        argumentName: 'SUBSPACE_NAME',
        description:
          '(EXPERIMENTAL) Specifies a Rush subspace to be installed. Requires the "subspacesEnabled" feature to be enabled in subspaces.json.'
      });
    }
  }

  /**
   * Used to implement the `preventSelectingAllSubspaces` policy which checks for commands that accidentally
   * select everything.   Return `true` if the CLI was invoked with selection parameters.
   *
   * @remarks
   * It is still possible for a user to select everything, but they must do so using an explicit selection
   * such as `rush install --from thing-that-everything-depends-on`.
   */
  public didUserSelectAnything(): boolean {
    if (this.#subspaceParameter?.value) {
      return true;
    }

    return [
      this.#impactedByProject,
      this.#impactedByExceptProject,
      this.#onlyProject,
      this.#toProject,
      this.#fromProject,
      this.#toExceptProject,
      this.#fromVersionPolicy,
      this.#toVersionPolicy
    ].some((x) => x.values.length > 0);
  }

  /**
   * Computes the set of selected projects based on all parameter values.
   *
   * If no parameters are specified, returns all projects in the Rush config file.
   */
  public async getSelectedProjectsAsync(
    terminal: ITerminal,
    allowEmptySelection?: boolean
  ): Promise<Set<RushConfigurationProject>> {
    // Hack out the old version-policy parameters
    for (const value of this.#fromVersionPolicy.values) {
      (this.#fromProject.values as string[]).push(`version-policy:${value}`);
    }
    for (const value of this.#toVersionPolicy.values) {
      (this.#toProject.values as string[]).push(`version-policy:${value}`);
    }

    const selectors: CommandLineStringListParameter[] = [
      this.#onlyProject,
      this.#fromProject,
      this.#toProject,
      this.#toExceptProject,
      this.#impactedByProject,
      this.#impactedByExceptProject
    ];

    // Check if any of the selection parameters have a value specified on the command line
    const isSelectionSpecified: boolean =
      selectors.some((param: CommandLineStringListParameter) => param.values.length > 0) ||
      !!this.#subspaceParameter?.value;

    // If no selection parameters are specified, return everything
    if (!isSelectionSpecified) {
      return allowEmptySelection ? new Set() : new Set(this.#rushConfiguration.projects);
    }

    const [
      // Include exactly these projects (--only)
      onlyProjects,
      // Include all projects that depend on these projects, and all dependencies thereof
      fromProjects,
      // --to
      toRaw,
      // --to-except
      toExceptProjects,
      // --impacted-by
      impactedByProjects,
      // --impacted-by-except
      impactedByExceptProjects
    ] = await Promise.all(
      selectors.map((param: CommandLineStringListParameter) => {
        return this.#evaluateProjectParameterAsync(param, terminal);
      })
    );

    let subspaceProjects: Iterable<RushConfigurationProject> = [];

    if (this.#subspaceParameter?.value) {
      if (!this.#rushConfiguration.subspacesFeatureEnabled) {
        // eslint-disable-next-line no-console
        console.log();
        // eslint-disable-next-line no-console
        console.log(
          Colorize.red(
            `The "${SUBSPACE_LONG_ARG_NAME}" parameter can only be passed if "subspacesEnabled" ` +
              'is set to true in subspaces.json.'
          )
        );
        throw new AlreadyReportedError();
      }

      const subspace: Subspace = this.#rushConfiguration.getSubspace(this.#subspaceParameter.value);
      subspaceProjects = subspace.getProjects();
    }

    const selection: Set<RushConfigurationProject> = Selection.union(
      // Safe command line options
      Selection.expandAllDependencies(
        Selection.union(
          toRaw,
          Selection.directDependenciesOf(toExceptProjects),
          // --from / --from-version-policy
          Selection.expandAllConsumers(fromProjects)
        )
      ),
      subspaceProjects,

      // Unsafe command line option: --only
      onlyProjects,

      // Unsafe command line options: --impacted-by, --impacted-by-except
      Selection.expandAllConsumers(
        Selection.union(impactedByProjects, Selection.directConsumersOf(impactedByExceptProjects))
      )
    );

    return selection;
  }

  /**
   * Represents the selection as `--filter` parameters to pnpm.
   *
   * @remarks
   *
   * IMPORTANT: This function produces PNPM CLI operators that select projects from PNPM's temp workspace.
   * If Rush subspaces are enabled, PNPM cannot see the complete Rush workspace, and therefore these operators
   * would malfunction. In the current implementation, we calculate them anyway, then `BaseInstallAction.runAsync()`
   * will overwrite `pnpmFilterArgumentValues` with a flat list of project names.  In the future, these
   * two code paths will be combined into a single general solution.
   *
   * @see https://pnpm.io/filtering
   */
  public async getPnpmFilterArgumentValuesAsync(terminal: ITerminal): Promise<string[]> {
    const args: string[] = [];

    // Include exactly these projects (--only)
    for (const project of await this.#evaluateProjectParameterAsync(this.#onlyProject, terminal)) {
      args.push(project.packageName);
    }

    // Include all projects that depend on these projects, and all dependencies thereof
    const fromProjects: Set<RushConfigurationProject> = Selection.union(
      // --from
      await this.#evaluateProjectParameterAsync(this.#fromProject, terminal)
    );

    // All specified projects and all projects that they depend on
    for (const project of Selection.union(
      // --to
      await this.#evaluateProjectParameterAsync(this.#toProject, terminal),
      // --from / --from-version-policy
      Selection.expandAllConsumers(fromProjects)
    )) {
      args.push(`${project.packageName}...`);
    }

    // --to-except
    // All projects that the project directly or indirectly declares as a dependency
    for (const project of await this.#evaluateProjectParameterAsync(this.#toExceptProject, terminal)) {
      args.push(`${project.packageName}^...`);
    }

    // --impacted-by
    // The project and all projects directly or indirectly declare it as a dependency
    for (const project of await this.#evaluateProjectParameterAsync(this.#impactedByProject, terminal)) {
      args.push(`...${project.packageName}`);
    }

    // --impacted-by-except
    // All projects that directly or indirectly declare the specified project as a dependency
    for (const project of await this.#evaluateProjectParameterAsync(
      this.#impactedByExceptProject,
      terminal
    )) {
      args.push(`...^${project.packageName}`);
    }

    return args;
  }

  /**
   * Usage telemetry for selection parameters. Only saved locally, and if requested in the config.
   */
  public getTelemetry(): { [key: string]: string } {
    return {
      command_from: `${this.#fromProject.values.length > 0}`,
      command_impactedBy: `${this.#impactedByProject.values.length > 0}`,
      command_impactedByExcept: `${this.#impactedByExceptProject.values.length > 0}`,
      command_only: `${this.#onlyProject.values.length > 0}`,
      command_to: `${this.#toProject.values.length > 0}`,
      command_toExcept: `${this.#toExceptProject.values.length > 0}`,

      command_fromVersionPolicy: `${this.#fromVersionPolicy.values.length > 0}`,
      command_toVersionPolicy: `${this.#toVersionPolicy.values.length > 0}`
    };
  }

  /**
   * Computes the referents of parameters that accept a project identifier.
   * Handles '.', unscoped names, and scoped names.
   */
  async #evaluateProjectParameterAsync(
    listParameter: CommandLineStringListParameter,
    terminal: ITerminal
  ): Promise<Set<RushConfigurationProject>> {
    const parameterName: string = listParameter.longName;
    const selection: Set<RushConfigurationProject> = new Set();

    for (const rawSelector of listParameter.values) {
      const scopeIndex: number = rawSelector.indexOf(':');

      let scope: string;
      let unscopedSelector: string;

      if (scopeIndex < 0) {
        // No explicit scope - determine if this looks like a path
        // Check for relative paths: '.', '..', or those followed by '/' and more
        // Check for absolute POSIX paths: starting with '/'
        const isRelativePath: boolean =
          rawSelector === '.' ||
          rawSelector === '..' ||
          rawSelector.startsWith('./') ||
          rawSelector.startsWith('../');
        const isAbsolutePosixPath: boolean = rawSelector.startsWith('/');

        if (isRelativePath || isAbsolutePosixPath) {
          // Route to path: selector
          scope = 'path';
          unscopedSelector = rawSelector;
        } else {
          // Default to name: selector
          scope = 'name';
          unscopedSelector = rawSelector;
        }
      } else {
        scope = rawSelector.slice(0, scopeIndex);
        unscopedSelector = rawSelector.slice(scopeIndex + 1);
      }

      const handler: ISelectorParser<RushConfigurationProject> | undefined =
        this.#selectorParserByScope.get(scope);
      if (!handler) {
        terminal.writeErrorLine(
          `Unsupported selector prefix "${scope}" passed to "${parameterName}": "${rawSelector}".` +
            ` Supported prefixes: ${Array.from(
              this.#selectorParserByScope.keys(),
              (selectorParserScope: string) => `"${selectorParserScope}:"`
            ).join(', ')}`
        );
        throw new AlreadyReportedError();
      }

      for (const project of await handler.evaluateSelectorAsync({
        unscopedSelector,
        terminal,
        parameterName
      })) {
        selection.add(project);
      }
    }

    return selection;
  }
}
