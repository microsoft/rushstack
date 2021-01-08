// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AlreadyReportedError, ConsoleTerminalProvider, Terminal } from '@rushstack/node-core-library';
import { CommandLineStringParameter } from '@rushstack/ts-command-line';

import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { BaseRushAction } from './BaseRushAction';
import { RushCommandLineParser } from '../RushCommandLineParser';

import { BuildCacheConfiguration } from '../../api/BuildCacheConfiguration';
import { ProjectBuilder } from '../../logic/taskRunner/ProjectBuilder';
import { PackageChangeAnalyzer } from '../../logic/PackageChangeAnalyzer';
import { Utilities } from '../../utilities/Utilities';
import { TaskSelector } from '../../logic/TaskSelector';

export class WriteBuildCacheAction extends BaseRushAction {
  private _command!: CommandLineStringParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'write-build-cache',
      summary: 'Writes the current state of the current project to the cache.',
      documentation:
        '(EXPERIMENTAL) If the build cache is configured, when this command is run in the folder of ' +
        'a project, write the current state of the project to the cache.',
      safeForSimultaneousRushProcesses: true,
      parser
    });
  }

  public onDefineParameters(): void {
    this._command = this.defineStringParameter({
      parameterLongName: '--command',
      parameterShortName: '-c',
      required: true,
      argumentName: 'COMMAND',
      description:
        '(Required) The command run in the current project that produced the current project state.'
    });
  }

  public async runAsync(): Promise<void> {
    const project: RushConfigurationProject | undefined = this.rushConfiguration.tryGetProjectForPath(
      process.cwd()
    );

    if (!project) {
      throw new Error(
        `The "rush ${this.actionName}" command must be invoked under a project` +
          ` folder that is registered in rush.json.`
      );
    }

    const terminal: Terminal = new Terminal(new ConsoleTerminalProvider());
    const buildCacheConfiguration:
      | BuildCacheConfiguration
      | undefined = await BuildCacheConfiguration.loadFromDefaultPathAsync(terminal, this.rushConfiguration);
    if (!buildCacheConfiguration) {
      const buildCacheConfigurationFilePath: string = BuildCacheConfiguration.getBuildCacheConfigFilePath(
        this.rushConfiguration
      );
      terminal.writeErrorLine(
        `The a build cache has not been configured. Configure it by creating a ` +
          `"${buildCacheConfigurationFilePath}" file.`
      );
      throw new AlreadyReportedError();
    }

    const command: string = this._command.value!;
    const commandToRun: string | undefined = TaskSelector.getScriptToRun(project, command, []);

    const packageChangeAnalyzer: PackageChangeAnalyzer = new PackageChangeAnalyzer(this.rushConfiguration);
    const projectBuilder: ProjectBuilder = new ProjectBuilder({
      rushProject: project,
      rushConfiguration: this.rushConfiguration,
      buildCacheConfiguration,
      commandToRun: commandToRun || '',
      isIncrementalBuildAllowed: false,
      packageChangeAnalyzer,
      packageDepsFilename: Utilities.getPackageDepsFilenameForCommand(command)
    });

    const trackedFiles: string[] = Array.from(
      packageChangeAnalyzer.getPackageDeps(project.packageName)!.keys()
    );
    const cacheWriteSuccess: boolean | undefined = await projectBuilder.tryWriteCacheEntryAsync(
      terminal,
      trackedFiles
    );
    if (cacheWriteSuccess === undefined) {
      // We already projectBuilder already reported that the project doesn't support caching
      throw new AlreadyReportedError();
    } else if (cacheWriteSuccess === false) {
      terminal.writeErrorLine('Writing cache entry failed.');
    }
  }
}
