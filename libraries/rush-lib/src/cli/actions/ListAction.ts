// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Sort } from '@rushstack/node-core-library';
import { ConsoleTerminalProvider, Terminal } from '@rushstack/terminal';
import type { CommandLineFlagParameter } from '@rushstack/ts-command-line';

import { BaseRushAction } from './BaseRushAction';
import type { RushCommandLineParser } from '../RushCommandLineParser';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { VersionPolicyDefinitionName } from '../../api/VersionPolicy';
import { SelectionParameterSet } from '../parsing/SelectionParameterSet';

/**
 * Shape of "rush list --json" output.
 *
 * It contains parts (with different names) coming from
 * {@link ../../api/RushConfigurationProject#RushConfigurationProject | RushConfigurationProject}.
 */
export interface IJsonEntry {
  name: string;
  version: string;
  /**
   * @see {@link ../../api/RushConfigurationProject#RushConfigurationProject.publishFolder | RushConfigurationProject.publishFolder}
   */
  path: string;
  fullPath: string;
  /**
   * @see {@link ../../api/RushConfigurationProject#RushConfigurationProject.versionPolicyName | RushConfigurationProject.versionPolicyName}
   */
  versionPolicyName: string | undefined;
  /**
   * @see {@link ../../api/VersionPolicy#VersionPolicyDefinitionName | VersionPolicyDefinitionName}
   */
  versionPolicy: string | undefined;
  /**
   * @see {@link ../../api/RushConfigurationProject#RushConfigurationProject.shouldPublish | RushConfigurationProject.shouldPublish}
   */
  shouldPublish: boolean | undefined;
  /**
   * @see {@link ../../api/RushConfigurationProject#RushConfigurationProject.reviewCategory | RushConfigurationProject.reviewCategory}
   */
  reviewCategory: string | undefined;
  /**
   * @see {@link ../../api/RushConfigurationProject#RushConfigurationProject.tags | RushConfigurationProject.tags}
   */
  tags: string[];
}

export interface IJsonOutput {
  projects: IJsonEntry[];
}

export class ListAction extends BaseRushAction {
  private readonly _version: CommandLineFlagParameter;
  private readonly _path: CommandLineFlagParameter;
  private readonly _fullPath: CommandLineFlagParameter;
  private readonly _jsonFlag: CommandLineFlagParameter;
  private readonly _detailedFlag: CommandLineFlagParameter;
  private readonly _selectionParameters: SelectionParameterSet;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'list',
      summary: 'List package information for all projects in the repo',
      documentation:
        'List package names, and optionally version (--version) and ' +
        'path (--path) or full path (--full-path), for projects in the ' +
        'current rush config.',
      parser,
      safeForSimultaneousRushProcesses: true
    });

    this._version = this.defineFlagParameter({
      parameterLongName: '--version',
      parameterShortName: '-v',
      description:
        'If this flag is specified, the project version will be ' +
        'displayed in a column along with the package name.'
    });

    this._path = this.defineFlagParameter({
      parameterLongName: '--path',
      parameterShortName: '-p',
      description:
        'If this flag is specified, the project path will be ' +
        'displayed in a column along with the package name.'
    });

    this._fullPath = this.defineFlagParameter({
      parameterLongName: '--full-path',
      description:
        'If this flag is specified, the project full path will ' +
        'be displayed in a column along with the package name.'
    });

    this._detailedFlag = this.defineFlagParameter({
      parameterLongName: '--detailed',
      description:
        'For the non --json view, if this flag is specified, ' +
        'include path (-p), version (-v) columns along with ' +
        "the project's applicable: versionPolicy, versionPolicyName, " +
        'shouldPublish, reviewPolicy, and tags fields.'
    });

    this._jsonFlag = this.defineFlagParameter({
      parameterLongName: '--json',
      description: 'If this flag is specified, output will be in JSON format.'
    });

    this._selectionParameters = new SelectionParameterSet(this.rushConfiguration, this, {
      gitOptions: {
        // Include lockfile processing since this expands the selection, and we need to select
        // at least the same projects selected with the same query to "rush build"
        includeExternalDependencies: true,
        // Disable filtering because rush-project.json is riggable and therefore may not be available
        enableFiltering: false
      },
      includeSubspaceSelector: false,
      cwd: this.parser.cwd
    });
  }

  protected async runAsync(): Promise<void> {
    const terminal: Terminal = new Terminal(new ConsoleTerminalProvider());
    const selection: Set<RushConfigurationProject> =
      await this._selectionParameters.getSelectedProjectsAsync(terminal);
    Sort.sortSetBy(selection, (x: RushConfigurationProject) => x.packageName);
    if (this._jsonFlag.value && this._detailedFlag.value) {
      throw new Error(`The parameters "--json" and "--detailed" cannot be used together.`);
    }

    if (this._jsonFlag.value) {
      this._printJson(selection);
    } else if (this._version.value || this._path.value || this._fullPath.value || this._detailedFlag.value) {
      await this._printListTableAsync(selection);
    } else {
      this._printList(selection);
    }
  }

  private _printJson(selection: Set<RushConfigurationProject>): void {
    const projects: IJsonEntry[] = Array.from(selection, (config: RushConfigurationProject): IJsonEntry => {
      let reviewCategory: undefined | string;
      let shouldPublish: undefined | boolean;
      let versionPolicy: undefined | string;
      let versionPolicyName: undefined | string;
      if (config.versionPolicy !== undefined) {
        const definitionName: string = VersionPolicyDefinitionName[config.versionPolicy.definitionName];
        versionPolicy = `${definitionName}`;
        versionPolicyName = config.versionPolicy.policyName;
      } else {
        shouldPublish = config.shouldPublish;
      }

      if (config.reviewCategory) {
        reviewCategory = config.reviewCategory;
      }

      return {
        name: config.packageName,
        version: config.packageJson.version,
        path: config.projectRelativeFolder,
        fullPath: config.projectFolder,
        versionPolicy,
        versionPolicyName,
        shouldPublish,
        reviewCategory,
        tags: Array.from(config.tags)
      };
    });

    const output: IJsonOutput = {
      projects
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(output, undefined, 2));
  }

  private _printList(selection: Set<RushConfigurationProject>): void {
    for (const project of selection) {
      // eslint-disable-next-line no-console
      console.log(project.packageName);
    }
  }

  private async _printListTableAsync(selection: Set<RushConfigurationProject>): Promise<void> {
    const tableHeader: string[] = ['Project'];
    if (this._version.value || this._detailedFlag.value) {
      tableHeader.push('Version');
    }

    if (this._path.value || this._detailedFlag.value) {
      tableHeader.push('Path');
    }

    if (this._fullPath.value) {
      tableHeader.push('Full Path');
    }

    if (this._detailedFlag.value) {
      tableHeader.push('Version policy');
      tableHeader.push('Version policy name');
      tableHeader.push('Should publish');
      tableHeader.push('Review category');
      tableHeader.push('Tags');
    }

    const { default: CliTable } = await import('cli-table');
    const table: import('cli-table') = new CliTable({
      head: tableHeader
    });

    for (const project of selection) {
      const packageRow: string[] = [];
      function appendToPackageRow(value: string): void {
        packageRow.push(value === undefined ? 'UNDEFINED' : value);
      }

      appendToPackageRow(project.packageName);

      if (this._version.value || this._detailedFlag.value) {
        appendToPackageRow(project.packageJson.version);
      }

      if (this._path.value || this._detailedFlag.value) {
        appendToPackageRow(project.projectRelativeFolder);
      }

      if (this._fullPath.value) {
        appendToPackageRow(project.projectFolder);
      }

      if (this._detailedFlag.value) {
        // When we HAVE a version policy
        let versionPolicyDefinitionName: string = '';
        let versionPolicyName: string = '';
        // When we DO NOT have version policy, fallback to shouldPublish boolean
        let shouldPublish: string = '';
        let reviewCategory: string = '';
        if (project.versionPolicy !== undefined) {
          const definitionName: string = VersionPolicyDefinitionName[project.versionPolicy.definitionName];
          versionPolicyDefinitionName = definitionName;
          versionPolicyName = project.versionPolicy.policyName;
        } else {
          shouldPublish = `${project.shouldPublish}`;
        }

        if (project.reviewCategory) {
          reviewCategory = project.reviewCategory;
        }

        appendToPackageRow(versionPolicyDefinitionName);
        appendToPackageRow(versionPolicyName);
        appendToPackageRow(shouldPublish);
        appendToPackageRow(reviewCategory);
        appendToPackageRow(Array.from(project.tags).join(', '));
      }

      table.push(packageRow);
    }

    // eslint-disable-next-line no-console
    console.log(table.toString());
  }
}
