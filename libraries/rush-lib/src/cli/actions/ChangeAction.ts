// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as child_process from 'child_process';

import type {
  CommandLineFlagParameter,
  CommandLineStringParameter,
  CommandLineChoiceParameter
} from '@rushstack/ts-command-line';
import { FileSystem, AlreadyReportedError } from '@rushstack/node-core-library';
import { Colorize } from '@rushstack/terminal';
import { getRepoRoot } from '@rushstack/package-deps-hash';
import type * as InquirerType from 'inquirer';

import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { type IChangeFile, type IChangeInfo, ChangeType } from '../../api/ChangeManagement';
import { ChangeFile } from '../../api/ChangeFile';
import { BaseRushAction } from './BaseRushAction';
import type { RushCommandLineParser } from '../RushCommandLineParser';
import { ChangeFiles } from '../../logic/ChangeFiles';
import {
  type VersionPolicy,
  type IndividualVersionPolicy,
  type LockStepVersionPolicy,
  VersionPolicyDefinitionName
} from '../../api/VersionPolicy';
import { ProjectChangeAnalyzer } from '../../logic/ProjectChangeAnalyzer';
import { Git } from '../../logic/Git';
import { RushConstants } from '../../logic/RushConstants';
import { Utilities } from '../../utilities/Utilities';

const BULK_LONG_NAME: string = '--bulk';
const BULK_MESSAGE_LONG_NAME: string = '--message';
const BULK_BUMP_TYPE_LONG_NAME: string = '--bump-type';

export class ChangeAction extends BaseRushAction {
  private readonly _git: Git;
  private readonly _verifyParameter: CommandLineFlagParameter;
  private readonly _noFetchParameter: CommandLineFlagParameter;
  private readonly _targetBranchParameter: CommandLineStringParameter;
  private readonly _changeEmailParameter: CommandLineStringParameter;
  private readonly _bulkChangeParameter: CommandLineFlagParameter;
  private readonly _bulkChangeMessageParameter: CommandLineStringParameter;
  private readonly _bulkChangeBumpTypeParameter: CommandLineChoiceParameter;
  private readonly _overwriteFlagParameter: CommandLineFlagParameter;
  private readonly _commitChangesFlagParameter: CommandLineFlagParameter;
  private readonly _commitChangesMessageStringParameter: CommandLineStringParameter;

  private _targetBranchName: string | undefined;

  public constructor(parser: RushCommandLineParser) {
    const documentation: string = [
      'Asks a series of questions and then generates a <branchname>-<timestamp>.json file ' +
        'in the common folder. The `publish` command will consume these files and perform the proper ' +
        'version bumps. Note these changes will eventually be published in a changelog.md file in each package.',
      '',
      'The possible types of changes are: ',
      '',
      'MAJOR - these are breaking changes that are not backwards compatible. ' +
        'Examples are: renaming a public class, adding/removing a non-optional ' +
        'parameter from a public API, or renaming an variable or function that ' +
        'is exported.',
      '',
      'MINOR - these are changes that are backwards compatible (but not ' +
        'forwards compatible). Examples are: adding a new public API or adding an ' +
        'optional parameter to a public API',
      '',
      'PATCH - these are changes that are backwards and forwards compatible. ' +
        'Examples are: Modifying a private API or fixing a bug in the logic ' +
        'of how an existing API works.',
      '',
      "NONE - these are changes that are backwards and forwards compatible and don't require an immediate release. " +
        'Examples are: Modifying dev tooling configuration like eslint.',
      '',
      'HOTFIX (EXPERIMENTAL) - these are changes that are hotfixes targeting a ' +
        'specific older version of the package. When a hotfix change is added, ' +
        'other changes will not be able to increment the version number. ' +
        `Enable this feature by setting 'hotfixChangeEnabled' in your ${RushConstants.rushJsonFilename}.`,
      ''
    ].join('\n');
    super({
      actionName: 'change',
      summary:
        'Records changes made to projects, indicating how the package version number should be bumped ' +
        'for the next publish.',
      documentation,
      safeForSimultaneousRushProcesses: true,
      parser
    });

    this._git = new Git(this.rushConfiguration);

    this._verifyParameter = this.defineFlagParameter({
      parameterLongName: '--verify',
      parameterShortName: '-v',
      description: 'Verify the change file has been generated and that it is a valid JSON file'
    });

    this._noFetchParameter = this.defineFlagParameter({
      parameterLongName: '--no-fetch',
      description: 'Skips fetching the baseline branch before running "git diff" to detect changes.'
    });

    this._targetBranchParameter = this.defineStringParameter({
      parameterLongName: '--target-branch',
      parameterShortName: '-b',
      argumentName: 'BRANCH',
      description:
        'If this parameter is specified, compare the checked out branch with the specified branch to ' +
        'determine which projects were changed. If this parameter is not specified, the checked out branch ' +
        'is compared against the "main" branch.'
    });

    this._overwriteFlagParameter = this.defineFlagParameter({
      parameterLongName: '--overwrite',
      description:
        `If a changefile already exists, overwrite without prompting ` +
        `(or erroring in ${BULK_LONG_NAME} mode).`
    });

    this._commitChangesFlagParameter = this.defineFlagParameter({
      parameterLongName: '--commit',
      parameterShortName: '-c',
      description: `If this flag is specified generated changefiles will be commited automatically.`
    });

    this._commitChangesMessageStringParameter = this.defineStringParameter({
      parameterLongName: '--commit-message',
      argumentName: 'COMMIT_MESSAGE',
      description: `If this parameter is specified generated changefiles will be commited automatically with the specified commit message.`
    });

    this._changeEmailParameter = this.defineStringParameter({
      parameterLongName: '--email',
      argumentName: 'EMAIL',
      description:
        'The email address to use in changefiles. If this parameter is not provided, the email address ' +
        'will be detected or prompted for in interactive mode.'
    });

    this._bulkChangeParameter = this.defineFlagParameter({
      parameterLongName: BULK_LONG_NAME,
      description:
        'If this flag is specified, apply the same change message and bump type to all changed projects. ' +
        `The ${BULK_MESSAGE_LONG_NAME} and the ${BULK_BUMP_TYPE_LONG_NAME} parameters must be specified if the ` +
        `${BULK_LONG_NAME} parameter is specified`
    });

    this._bulkChangeMessageParameter = this.defineStringParameter({
      parameterLongName: BULK_MESSAGE_LONG_NAME,
      argumentName: 'MESSAGE',
      description: `The message to apply to all changed projects if the ${BULK_LONG_NAME} flag is provided.`
    });

    this._bulkChangeBumpTypeParameter = this.defineChoiceParameter({
      parameterLongName: BULK_BUMP_TYPE_LONG_NAME,
      alternatives: [...Object.keys(this._getBumpOptions())],
      description: `The bump type to apply to all changed projects if the ${BULK_LONG_NAME} flag is provided.`
    });
  }

  public async runAsync(): Promise<void> {
    const targetBranch: string = await this._getTargetBranchAsync();
    // eslint-disable-next-line no-console
    console.log(`The target branch is ${targetBranch}`);

    if (this._verifyParameter.value) {
      const errors: string[] = [
        this._bulkChangeParameter,
        this._bulkChangeMessageParameter,
        this._bulkChangeBumpTypeParameter,
        this._overwriteFlagParameter,
        this._commitChangesFlagParameter
      ]
        .map((parameter) => {
          return parameter.value
            ? `The {${this._bulkChangeParameter.longName} parameter cannot be provided with the ` +
                `${this._verifyParameter.longName} parameter`
            : '';
        })
        .filter((error) => error !== '');
      if (errors.length > 0) {
        errors.forEach((error) => {
          // eslint-disable-next-line no-console
          console.error(error);
        });
        throw new AlreadyReportedError();
      }

      await this._verifyAsync();
      return;
    }

    const sortedProjectList: string[] = (await this._getChangedProjectNamesAsync()).sort();
    if (sortedProjectList.length === 0) {
      this._logNoChangeFileRequired();
      await this._warnUnstagedChangesAsync();
      return;
    }

    await this._warnUnstagedChangesAsync();

    const inquirer: typeof InquirerType = await import('inquirer');
    const promptModule: InquirerType.PromptModule = inquirer.createPromptModule();
    let changeFileData: Map<string, IChangeFile> = new Map<string, IChangeFile>();
    let interactiveMode: boolean = false;
    if (this._bulkChangeParameter.value) {
      if (
        !this._bulkChangeBumpTypeParameter.value ||
        (!this._bulkChangeMessageParameter.value &&
          this._bulkChangeBumpTypeParameter.value !== ChangeType[ChangeType.none])
      ) {
        throw new Error(
          `The ${this._bulkChangeBumpTypeParameter.longName} and ${this._bulkChangeMessageParameter.longName} ` +
            `parameters must provided if the ${this._bulkChangeParameter.longName} flag is provided. If the value ` +
            `"${ChangeType[ChangeType.none]}" is provided to the ${
              this._bulkChangeBumpTypeParameter.longName
            } ` +
            `parameter, the ${this._bulkChangeMessageParameter.longName} parameter may be omitted.`
        );
      }

      const email: string | undefined = this._changeEmailParameter.value || this._detectEmail();
      if (!email) {
        throw new Error(
          "Unable to detect Git email and an email address wasn't provided using the " +
            `${this._changeEmailParameter.longName} parameter.`
        );
      }

      const errors: string[] = [];

      const comment: string = this._bulkChangeMessageParameter.value || '';
      const changeType: string = this._bulkChangeBumpTypeParameter.value;
      for (const packageName of sortedProjectList) {
        const allowedBumpTypes: string[] = Object.keys(this._getBumpOptions(packageName));
        let projectChangeType: string = changeType;
        if (allowedBumpTypes.length === 0) {
          projectChangeType = ChangeType[ChangeType.none];
        } else if (
          projectChangeType !== ChangeType[ChangeType.none] &&
          allowedBumpTypes.indexOf(projectChangeType) === -1
        ) {
          errors.push(`The "${projectChangeType}" change type is not allowed for package "${packageName}".`);
        }

        changeFileData.set(packageName, {
          changes: [
            {
              comment,
              type: projectChangeType,
              packageName
            } as IChangeInfo
          ],
          packageName,
          email
        });
      }

      if (errors.length > 0) {
        for (const error of errors) {
          // eslint-disable-next-line no-console
          console.error(error);
        }

        throw new AlreadyReportedError();
      }
    } else if (this._bulkChangeBumpTypeParameter.value || this._bulkChangeMessageParameter.value) {
      throw new Error(
        `The ${this._bulkChangeParameter.longName} flag must be provided with the ` +
          `${this._bulkChangeBumpTypeParameter.longName} and ${this._bulkChangeMessageParameter.longName} parameters.`
      );
    } else {
      interactiveMode = true;

      const existingChangeComments: Map<string, string[]> = ChangeFiles.getChangeComments(
        await this._getChangeFilesAsync()
      );
      changeFileData = await this._promptForChangeFileDataAsync(
        promptModule,
        sortedProjectList,
        existingChangeComments
      );

      if (this._isEmailRequired(changeFileData)) {
        const email: string = this._changeEmailParameter.value
          ? this._changeEmailParameter.value
          : await this._detectOrAskForEmailAsync(promptModule);
        changeFileData.forEach((changeFile: IChangeFile) => {
          changeFile.email = this.rushConfiguration.getProjectByName(changeFile.packageName)?.versionPolicy
            ?.includeEmailInChangeFile
            ? email
            : '';
        });
      }
    }
    let changefiles: string[];
    try {
      changefiles = await this._writeChangeFilesAsync(
        promptModule,
        changeFileData,
        this._overwriteFlagParameter.value,
        interactiveMode
      );
    } catch (error) {
      throw new Error(`There was an error creating a change file: ${(error as Error).toString()}`);
    }
    if (this._commitChangesFlagParameter.value || this._commitChangesMessageStringParameter.value) {
      if (changefiles && changefiles.length !== 0) {
        await this._stageAndCommitGitChangesAsync(
          changefiles,
          this._commitChangesMessageStringParameter.value ||
            this.rushConfiguration.gitChangefilesCommitMessage ||
            'Rush change'
        );
      } else {
        this.terminal.writeWarningLine('Warning: No change files generated, nothing to commit.');
      }
    }
  }

  private _generateHostMap(): Map<RushConfigurationProject, string> {
    const hostMap: Map<RushConfigurationProject, string> = new Map();
    for (const project of this.rushConfiguration.projects) {
      let hostProjectName: string = project.packageName;
      if (project.versionPolicy?.isLockstepped) {
        const lockstepPolicy: LockStepVersionPolicy = project.versionPolicy as LockStepVersionPolicy;
        hostProjectName = lockstepPolicy.mainProject || project.packageName;
      }

      hostMap.set(project, hostProjectName);
    }

    return hostMap;
  }

  private async _verifyAsync(): Promise<void> {
    const changedPackages: string[] = await this._getChangedProjectNamesAsync();
    if (changedPackages.length > 0) {
      await this._validateChangeFileAsync(changedPackages);
    } else {
      this._logNoChangeFileRequired();
    }
  }

  private async _getTargetBranchAsync(): Promise<string> {
    if (!this._targetBranchName) {
      this._targetBranchName =
        this._targetBranchParameter.value || (await this._git.getRemoteDefaultBranchAsync());
    }

    return this._targetBranchName;
  }

  private async _getChangedProjectNamesAsync(): Promise<string[]> {
    const projectChangeAnalyzer: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(this.rushConfiguration);
    const changedProjects: Set<RushConfigurationProject> =
      await projectChangeAnalyzer.getChangedProjectsAsync({
        targetBranchName: await this._getTargetBranchAsync(),
        terminal: this.terminal,
        shouldFetch: !this._noFetchParameter.value,
        // Lockfile evaluation will expand the set of projects that request change files
        // Not enabling, since this would be a breaking change
        includeExternalDependencies: false,
        // Since install may not have happened, cannot read rush-project.json
        enableFiltering: false
      });
    const projectHostMap: Map<RushConfigurationProject, string> = this._generateHostMap();

    const changedProjectNames: Set<string> = new Set<string>();
    for (const changedProject of changedProjects) {
      if (changedProject.shouldPublish && !changedProject.versionPolicy?.exemptFromRushChange) {
        const hostName: string | undefined = projectHostMap.get(changedProject);
        if (hostName) {
          changedProjectNames.add(hostName);
        }
      }
    }

    return Array.from(changedProjectNames);
  }

  private async _validateChangeFileAsync(changedPackages: string[]): Promise<void> {
    const files: string[] = await this._getChangeFilesAsync();
    ChangeFiles.validate(files, changedPackages, this.rushConfiguration);
  }

  private async _getChangeFilesAsync(): Promise<string[]> {
    const repoRoot: string = getRepoRoot(this.rushConfiguration.rushJsonFolder);
    const relativeChangesFolder: string = path.relative(repoRoot, this.rushConfiguration.changesFolder);
    const targetBranch: string = await this._getTargetBranchAsync();
    const changedFiles: string[] = await this._git.getChangedFilesAsync(
      targetBranch,
      this.terminal,
      true,
      relativeChangesFolder
    );

    const result: string[] = [];
    for (const changedFile of changedFiles) {
      result.push(path.join(repoRoot, changedFile));
    }

    return result;
  }

  /**
   * The main loop which prompts the user for information on changed projects.
   */
  private async _promptForChangeFileDataAsync(
    promptModule: InquirerType.PromptModule,
    sortedProjectList: string[],
    existingChangeComments: Map<string, string[]>
  ): Promise<Map<string, IChangeFile>> {
    const changedFileData: Map<string, IChangeFile> = new Map<string, IChangeFile>();

    for (const projectName of sortedProjectList) {
      const changeInfo: IChangeInfo | undefined = await this._askQuestionsAsync(
        promptModule,
        projectName,
        existingChangeComments
      );
      if (changeInfo) {
        // Save the info into the change file
        let changeFile: IChangeFile | undefined = changedFileData.get(changeInfo.packageName);
        if (!changeFile) {
          changeFile = {
            changes: [],
            packageName: changeInfo.packageName,
            email: undefined
          };
          changedFileData.set(changeInfo.packageName, changeFile!);
        }

        changeFile!.changes.push(changeInfo);
      }
    }

    return changedFileData;
  }

  /**
   * Asks all questions which are needed to generate changelist for a project.
   */
  private async _askQuestionsAsync(
    promptModule: InquirerType.PromptModule,
    packageName: string,
    existingChangeComments: Map<string, string[]>
  ): Promise<IChangeInfo | undefined> {
    // eslint-disable-next-line no-console
    console.log(`\n${packageName}`);
    const comments: string[] | undefined = existingChangeComments.get(packageName);
    if (comments) {
      // eslint-disable-next-line no-console
      console.log(`Found existing comments:`);
      comments.forEach((comment) => {
        // eslint-disable-next-line no-console
        console.log(`    > ${comment}`);
      });
      const { appendComment }: { appendComment: 'skip' | 'append' } = await promptModule({
        name: 'appendComment',
        type: 'list',
        default: 'skip',
        message: 'Append to existing comments or skip?',
        choices: [
          {
            name: 'Skip',
            value: 'skip'
          },
          {
            name: 'Append',
            value: 'append'
          }
        ]
      });

      if (appendComment === 'skip') {
        return undefined;
      } else {
        return await this._promptForCommentsAsync(promptModule, packageName);
      }
    } else {
      return await this._promptForCommentsAsync(promptModule, packageName);
    }
  }

  private async _promptForCommentsAsync(
    promptModule: InquirerType.PromptModule,
    packageName: string
  ): Promise<IChangeInfo | undefined> {
    const bumpOptions: { [type: string]: string } = this._getBumpOptions(packageName);
    const { comment }: { comment: string } = await promptModule({
      name: 'comment',
      type: 'input',
      message: `Describe changes, or ENTER if no changes:`
    });

    if (Object.keys(bumpOptions).length === 0 || !comment) {
      return {
        packageName: packageName,
        comment: comment || '',
        type: ChangeType[ChangeType.none]
      } as IChangeInfo;
    } else {
      const { bumpType }: { bumpType: string } = await promptModule({
        choices: Object.keys(bumpOptions).map((option) => {
          return {
            value: option,
            name: bumpOptions[option]
          };
        }),
        default: 'patch',
        message: 'Select the type of change:',
        name: 'bumpType',
        type: 'list'
      });

      return {
        packageName: packageName,
        comment: comment,
        type: bumpType
      } as IChangeInfo;
    }
  }

  private _getBumpOptions(packageName?: string): { [type: string]: string } {
    let bumpOptions: { [type: string]: string } =
      this.rushConfiguration && this.rushConfiguration.hotfixChangeEnabled
        ? {
            [ChangeType[ChangeType.hotfix]]:
              'hotfix - for changes that need to be published in a separate hotfix package'
          }
        : {
            [ChangeType[ChangeType.major]]:
              'major - for changes that break compatibility, e.g. removing an API',
            [ChangeType[ChangeType.minor]]: 'minor - for backwards compatible changes, e.g. adding a new API',
            [ChangeType[ChangeType.patch]]:
              'patch - for changes that do not affect compatibility, e.g. fixing a bug',
            [ChangeType[ChangeType.none]]:
              'none - for changes that do not need an immediate release, e.g. eslint config change'
          };

    if (packageName) {
      const project: RushConfigurationProject | undefined =
        this.rushConfiguration.getProjectByName(packageName);
      const versionPolicy: VersionPolicy | undefined = project!.versionPolicy;

      if (versionPolicy) {
        if (versionPolicy.definitionName === VersionPolicyDefinitionName.lockStepVersion) {
          const lockStepPolicy: LockStepVersionPolicy = versionPolicy as LockStepVersionPolicy;
          // No need to ask for bump types if project is lockstep versioned with an explicit nextBump
          if (lockStepPolicy.nextBump !== undefined) {
            bumpOptions = {};
          }
        } else if (versionPolicy.definitionName === VersionPolicyDefinitionName.individualVersion) {
          const individualPolicy: IndividualVersionPolicy = versionPolicy as IndividualVersionPolicy;
          if (individualPolicy.lockedMajor !== undefined) {
            delete bumpOptions[ChangeType[ChangeType.major]];
          }
        }
      }
    }

    return bumpOptions;
  }

  private _isEmailRequired(changeFileData: Map<string, IChangeFile>): boolean {
    return [...changeFileData.values()].some(
      (changeFile) =>
        !!this.rushConfiguration.getProjectByName(changeFile.packageName)?.versionPolicy
          ?.includeEmailInChangeFile
    );
  }

  /**
   * Will determine a user's email by first detecting it from their Git config,
   * or will ask for it if it is not found or the Git config is wrong.
   */
  private async _detectOrAskForEmailAsync(promptModule: InquirerType.PromptModule): Promise<string> {
    return (
      (await this._detectAndConfirmEmailAsync(promptModule)) ||
      (await this._promptForEmailAsync(promptModule))
    );
  }

  private _detectEmail(): string | undefined {
    try {
      return child_process
        .execSync('git config user.email')
        .toString()
        .replace(/(\r\n|\n|\r)/gm, '');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log('There was an issue detecting your Git email...');
      return undefined;
    }
  }

  /**
   * Detects the user's email address from their Git configuration, prompts the user to approve the
   * detected email. It returns undefined if it cannot be detected.
   */
  private async _detectAndConfirmEmailAsync(
    promptModule: InquirerType.PromptModule
  ): Promise<string | undefined> {
    const email: string | undefined = this._detectEmail();

    if (email) {
      const { isCorrectEmail }: { isCorrectEmail: boolean } = await promptModule([
        {
          type: 'confirm',
          name: 'isCorrectEmail',
          default: 'Y',
          message: `Is your email address ${email}?`
        }
      ]);
      return isCorrectEmail ? email : undefined;
    } else {
      return undefined;
    }
  }

  /**
   * Asks the user for their email address
   */
  private async _promptForEmailAsync(promptModule: InquirerType.PromptModule): Promise<string> {
    const { email }: { email: string } = await promptModule([
      {
        type: 'input',
        name: 'email',
        message: 'What is your email address?',
        validate: (input: string) => {
          return true; // @todo should be an email
        }
      }
    ]);
    return email;
  }

  private async _warnUnstagedChangesAsync(): Promise<void> {
    try {
      const hasUnstagedChanges: boolean = await this._git.hasUnstagedChangesAsync();
      if (hasUnstagedChanges) {
        // eslint-disable-next-line no-console
        console.log(
          '\n' +
            Colorize.yellow(
              'Warning: You have unstaged changes, which do not trigger prompting for change ' +
                'descriptions.'
            )
        );
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log(`An error occurred when detecting unstaged changes: ${error}`);
    }
  }

  /**
   * Writes change files to the common/changes folder. Will prompt for overwrite if file already exists.
   */
  private async _writeChangeFilesAsync(
    promptModule: InquirerType.PromptModule,
    changeFileData: Map<string, IChangeFile>,
    overwrite: boolean,
    interactiveMode: boolean
  ): Promise<string[]> {
    const writtenFiles: string[] = [];
    await changeFileData.forEach(async (changeFile: IChangeFile) => {
      const writtenFile: string | undefined = await this._writeChangeFileAsync(
        promptModule,
        changeFile,
        overwrite,
        interactiveMode
      );
      if (writtenFile) {
        writtenFiles.push(writtenFile);
      }
    });
    return writtenFiles;
  }

  private async _writeChangeFileAsync(
    promptModule: InquirerType.PromptModule,
    changeFileData: IChangeFile,
    overwrite: boolean,
    interactiveMode: boolean
  ): Promise<string | undefined> {
    const output: string = JSON.stringify(changeFileData, undefined, 2);
    const changeFile: ChangeFile = new ChangeFile(changeFileData, this.rushConfiguration);
    const filePath: string = changeFile.generatePath();

    const fileExists: boolean = FileSystem.exists(filePath);
    const shouldWrite: boolean =
      !fileExists ||
      overwrite ||
      (interactiveMode ? await this._promptForOverwriteAsync(promptModule, filePath) : false);

    if (!interactiveMode && fileExists && !overwrite) {
      throw new Error(`Changefile ${filePath} already exists`);
    }

    if (shouldWrite) {
      this._writeFile(filePath, output, shouldWrite && fileExists);
      return filePath;
    }
  }

  private async _promptForOverwriteAsync(
    promptModule: InquirerType.PromptModule,
    filePath: string
  ): Promise<boolean> {
    const overwrite: boolean = await promptModule([
      {
        name: 'overwrite',
        type: 'confirm',
        message: `Overwrite ${filePath}?`
      }
    ]);

    if (overwrite) {
      return true;
    } else {
      // eslint-disable-next-line no-console
      console.log(`Not overwriting ${filePath}`);
      return false;
    }
  }

  /**
   * Writes a file to disk, ensuring the directory structure up to that point exists
   */
  private _writeFile(fileName: string, output: string, isOverwrite: boolean): void {
    FileSystem.writeFile(fileName, output, { ensureFolderExists: true });
    if (isOverwrite) {
      // eslint-disable-next-line no-console
      console.log(`Overwrote file: ${fileName}`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`Created file: ${fileName}`);
    }
  }

  private _logNoChangeFileRequired(): void {
    // eslint-disable-next-line no-console
    console.log('No changes were detected to relevant packages on this branch. Nothing to do.');
  }

  private async _stageAndCommitGitChangesAsync(pattern: string[], message: string): Promise<void> {
    try {
      await Utilities.executeCommandAsync({
        command: 'git',
        args: ['add', ...pattern],
        workingDirectory: this.rushConfiguration.changesFolder
      });
      await Utilities.executeCommandAsync({
        command: 'git',
        args: ['commit', ...pattern, '-m', message],
        workingDirectory: this.rushConfiguration.changesFolder
      });
    } catch (error) {
      this.terminal.writeErrorLine(`ERROR: Cannot stage and commit git changes ${(error as Error).message}`);
    }
  }
}
