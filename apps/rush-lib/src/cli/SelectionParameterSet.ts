// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import colors from 'colors/safe';

import {
  PackageName,
  AlreadyReportedError,
  PackageJsonLookup,
  IPackageJson
} from '@rushstack/node-core-library';
import { CommandLineParameterProvider, CommandLineStringListParameter } from '@rushstack/ts-command-line';

import { RushConfiguration } from '../api/RushConfiguration';
import { RushConfigurationProject } from '../api/RushConfigurationProject';
import { Selection } from '../logic/Selection';

/**
 * This class is provides the set of command line parameters used to select projects
 * based on dependencies.
 *
 * It is a separate component such that unrelated actions can share the same parameters.
 */
export class SelectionParameterSet {
  private readonly _rushConfiguration: RushConfiguration;

  private readonly _fromProject: CommandLineStringListParameter;
  private readonly _impactedByProject: CommandLineStringListParameter;
  private readonly _impactedByExceptProject: CommandLineStringListParameter;
  private readonly _onlyProject: CommandLineStringListParameter;
  private readonly _toProject: CommandLineStringListParameter;
  private readonly _toExceptProject: CommandLineStringListParameter;

  private readonly _fromVersionPolicy: CommandLineStringListParameter;
  private readonly _toVersionPolicy: CommandLineStringListParameter;

  public constructor(rushConfiguration: RushConfiguration, action: CommandLineParameterProvider) {
    this._rushConfiguration = rushConfiguration;

    const getProjectNames: () => Promise<string[]> = this._getProjectNames.bind(this);

    this._toProject = action.defineStringListParameter({
      parameterLongName: '--to',
      parameterShortName: '-t',
      argumentName: 'PROJECT',
      description:
        'Normally all projects in the monorepo will be processed;' +
        ' adding this parameter will instead select a subset of projects.' +
        ' Each "--to" parameter expands this selection to include PROJECT and all its dependencies.' +
        ' "." can be used as shorthand for the project in the current working directory.' +
        ' For details, refer to the website article "Selecting subsets of projects".',
      completions: getProjectNames
    });
    this._toExceptProject = action.defineStringListParameter({
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
      completions: getProjectNames
    });

    this._fromProject = action.defineStringListParameter({
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
      completions: getProjectNames
    });
    this._onlyProject = action.defineStringListParameter({
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
      completions: getProjectNames
    });

    this._impactedByProject = action.defineStringListParameter({
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
      completions: getProjectNames
    });

    this._impactedByExceptProject = action.defineStringListParameter({
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
      completions: getProjectNames
    });

    this._toVersionPolicy = action.defineStringListParameter({
      parameterLongName: '--to-version-policy',
      argumentName: 'VERSION_POLICY_NAME',
      description:
        'Normally all projects in the monorepo will be processed;' +
        ' adding this parameter will instead select a subset of projects.' +
        ' The "--to-version-policy" parameter is equivalent to specifying "--to" for each of the projects' +
        ' belonging to VERSION_POLICY_NAME.' +
        ' For details, refer to the website article "Selecting subsets of projects".'
    });
    this._fromVersionPolicy = action.defineStringListParameter({
      parameterLongName: '--from-version-policy',
      argumentName: 'VERSION_POLICY_NAME',
      description:
        'Normally all projects in the monorepo will be processed;' +
        ' adding this parameter will instead select a subset of projects.' +
        ' The "--from-version-policy" parameter is equivalent to specifying "--from" for each of the projects' +
        ' belonging to VERSION_POLICY_NAME.' +
        ' For details, refer to the website article "Selecting subsets of projects".'
    });
  }

  /**
   * Computes the set of selected projects based on all parameter values.
   *
   * If no parameters are specified, returns all projects in the Rush config file.
   */
  public getSelectedProjects(): Set<RushConfigurationProject> {
    // Include exactly these projects (--only)
    const onlyProjects: Iterable<RushConfigurationProject> = this._evaluateProjectParameter(
      this._onlyProject
    );

    // Include all projects that depend on these projects, and all dependencies thereof
    const fromProjects: Set<RushConfigurationProject> = Selection.union(
      // --from
      this._evaluateProjectParameter(this._fromProject),
      // --from-version-policy
      this._evaluateVersionPolicyProjects(this._fromVersionPolicy)
    );

    // Include dependencies of these projects
    const toProjects: Set<RushConfigurationProject> = Selection.union(
      // --to
      this._evaluateProjectParameter(this._toProject),
      // --to-version-policy
      this._evaluateVersionPolicyProjects(this._toVersionPolicy),
      // --to-except
      Selection.directDependenciesOf(this._evaluateProjectParameter(this._toExceptProject)),
      // --from / --from-version-policy
      Selection.expandAllConsumers(fromProjects)
    );

    // These projects will not have their dependencies included
    const impactedByProjects: Set<RushConfigurationProject> = Selection.union(
      // --impacted-by
      this._evaluateProjectParameter(this._impactedByProject),
      // --impacted-by-except
      Selection.directConsumersOf(this._evaluateProjectParameter(this._impactedByExceptProject))
    );

    const selection: Set<RushConfigurationProject> = Selection.union(
      onlyProjects,
      Selection.expandAllDependencies(toProjects),
      // Only dependents of these projects, not dependencies
      Selection.expandAllConsumers(impactedByProjects)
    );

    // If no projects selected, select everything.
    if (selection.size === 0) {
      for (const project of this._rushConfiguration.projects) {
        selection.add(project);
      }
    }

    return selection;
  }

  /**
   * Represents the selection as `--filter` parameters to pnpm.
   *
   * @remarks
   * This is a separate from the selection to allow the filters to be represented more concisely.
   *
   * @see https://pnpm.js.org/en/filtering
   */
  public getPnpmFilterArguments(): string[] {
    const args: string[] = [];

    // Include exactly these projects (--only)
    for (const project of this._evaluateProjectParameter(this._onlyProject)) {
      args.push('--filter', project.packageName);
    }

    // Include all projects that depend on these projects, and all dependencies thereof
    const fromProjects: Set<RushConfigurationProject> = Selection.union(
      // --from
      this._evaluateProjectParameter(this._fromProject),
      // --from-version-policy
      this._evaluateVersionPolicyProjects(this._fromVersionPolicy)
    );

    // All specified projects and all projects that they depend on
    for (const project of Selection.union(
      // --to
      this._evaluateProjectParameter(this._toProject),
      // --to-version-policy
      this._evaluateVersionPolicyProjects(this._toVersionPolicy),
      // --from / --from-version-policy
      Selection.expandAllConsumers(fromProjects)
    )) {
      args.push('--filter', `${project.packageName}...`);
    }

    // --to-except
    // All projects that the project directly or indirectly declares as a dependency
    for (const project of this._evaluateProjectParameter(this._toExceptProject)) {
      args.push('--filter', `${project.packageName}^...`);
    }

    // --impacted-by
    // The project and all projects directly or indirectly declare it as a dependency
    for (const project of this._evaluateProjectParameter(this._impactedByProject)) {
      args.push('--filter', `...${project.packageName}`);
    }

    // --impacted-by-except
    // All projects that directly or indirectly declare the specified project as a dependency
    for (const project of this._evaluateProjectParameter(this._impactedByExceptProject)) {
      args.push('--filter', `...^${project.packageName}`);
    }

    return args;
  }

  /**
   * Usage telemetry for selection parameters. Only saved locally, and if requested in the config.
   */
  public getTelemetry(): { [key: string]: string } {
    return {
      command_from: `${this._fromProject.values.length > 0}`,
      command_impactedBy: `${this._impactedByProject.values.length > 0}`,
      command_impactedByExcept: `${this._impactedByExceptProject.values.length > 0}`,
      command_only: `${this._onlyProject.values.length > 0}`,
      command_to: `${this._toProject.values.length > 0}`,
      command_toExcept: `${this._toExceptProject.values.length > 0}`,

      command_fromVersionPolicy: `${this._fromVersionPolicy.values.length > 0}`,
      command_toVersionPolicy: `${this._toVersionPolicy.values.length > 0}`
    };
  }

  /**
   * Computes the referents of parameters that accept a project identifier.
   * Handles '.', unscoped names, and scoped names.
   */
  private *_evaluateProjectParameter(
    projectsParameters: CommandLineStringListParameter
  ): Iterable<RushConfigurationProject> {
    const packageJsonLookup: PackageJsonLookup = PackageJsonLookup.instance;

    for (const projectParameter of projectsParameters.values) {
      if (projectParameter === '.') {
        const packageJson: IPackageJson | undefined = packageJsonLookup.tryLoadPackageJsonFor(process.cwd());
        if (packageJson) {
          const project: RushConfigurationProject | undefined = this._rushConfiguration.getProjectByName(
            packageJson.name
          );

          if (project) {
            yield project;
          } else {
            console.log(
              colors.red(
                'Rush is not currently running in a project directory specified in rush.json. ' +
                  `The "." value for the ${projectsParameters.longName} parameter is not allowed.`
              )
            );
            throw new AlreadyReportedError();
          }
        } else {
          console.log(
            colors.red(
              'Rush is not currently running in a project directory. ' +
                `The "." value for the ${projectsParameters.longName} parameter is not allowed.`
            )
          );
          throw new AlreadyReportedError();
        }
      } else {
        const project:
          | RushConfigurationProject
          | undefined = this._rushConfiguration.findProjectByShorthandName(projectParameter);
        if (!project) {
          console.log(colors.red(`The project '${projectParameter}' does not exist in rush.json.`));
          throw new AlreadyReportedError();
        }

        yield project;
      }
    }
  }

  /**
   * Computes the set of available project names, for use by tab completion.
   */
  private async _getProjectNames(): Promise<string[]> {
    const unscopedNamesMap: Map<string, number> = new Map<string, number>();

    const scopedNames: Set<string> = new Set();

    for (const project of this._rushConfiguration.rushConfigurationJson.projects) {
      scopedNames.add(project.packageName);
      const unscopedName: string = PackageName.getUnscopedName(project.packageName);
      const count: number = unscopedNamesMap.get(unscopedName) || 0;
      unscopedNamesMap.set(unscopedName, count + 1);
    }

    const unscopedNames: string[] = [];

    for (const [unscopedName, unscopedNameCount] of unscopedNamesMap) {
      // don't suggest ambiguous unscoped names
      if (unscopedNameCount === 1 && !scopedNames.has(unscopedName)) {
        unscopedNames.push(unscopedName);
      }
    }

    return unscopedNames.sort().concat([...scopedNames].sort());
  }

  /**
   * Computes the set of projects that have the specified version policy
   */
  private *_evaluateVersionPolicyProjects(
    versionPoliciesParameters: CommandLineStringListParameter
  ): Iterable<RushConfigurationProject> {
    if (versionPoliciesParameters.values && versionPoliciesParameters.values.length > 0) {
      const policyNames: Set<string> = new Set(versionPoliciesParameters.values);

      for (const policyName of policyNames) {
        if (!this._rushConfiguration.versionPolicyConfiguration.versionPolicies.has(policyName)) {
          console.log(
            colors.red(`The version policy '${policyName}' does not exist in version-policies.json.`)
          );
          throw new AlreadyReportedError();
        }
      }

      for (const project of this._rushConfiguration.projects) {
        const matches: boolean = !!project.versionPolicyName && policyNames.has(project.versionPolicyName);
        if (matches) {
          yield project;
        }
      }
    }
  }
}
