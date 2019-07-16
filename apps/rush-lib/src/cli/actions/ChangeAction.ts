// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as path from 'path';
import * as child_process from 'child_process';
import * as colors from 'colors';

import inquirer = require('inquirer');

import {
  CommandLineFlagParameter,
  CommandLineStringParameter,
  CommandLineChoiceParameter
} from '@microsoft/ts-command-line';
import { FileSystem } from '@microsoft/node-core-library';

import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import {
  IChangeFile,
  IChangeInfo,
  ChangeType
} from '../../api/ChangeManagement';
import { VersionControl } from '../../utilities/VersionControl';
import { ChangeFile } from '../../api/ChangeFile';
import { BaseRushAction } from './BaseRushAction';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { ChangeFiles } from '../../logic/ChangeFiles';
import {
  VersionPolicy,
  IndividualVersionPolicy,
  LockStepVersionPolicy,
  VersionPolicyDefinitionName
} from '../../api/VersionPolicy';
import { AlreadyReportedError } from '../../utilities/AlreadyReportedError';

export class ChangeAction extends BaseRushAction {
  private _changeComments: Map<string, string[]>;
  private _verifyParameter: CommandLineFlagParameter;
  private _noFetchParameter: CommandLineFlagParameter;
  private _targetBranchParameter: CommandLineStringParameter;
  private _changeEmailParameter: CommandLineStringParameter;
  private _bulkChangeParameter: CommandLineFlagParameter;
  private _bulkChangeMessageParameter: CommandLineStringParameter;
  private _bulkChangeBumpTypeParameter: CommandLineChoiceParameter;
  private _overwriteFlagParemter: CommandLineFlagParameter;

  private _targetBranchName: string;
  private _projectHostMap: Map<string, string>;

  private _prompt: inquirer.PromptModule;

  constructor(parser: RushCommandLineParser) {
    const documentation: string[] = [
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
      'HOTFIX (EXPERIMENTAL) - these are changes that are hotfixes targeting a ' +
      'specific older version of the package. When a hotfix change is added, ' +
      'other changes will not be able to increment the version number.' +
      'Enable this feature by setting \'hotfixChangeEnabled\' in your rush.json.',
      ''
    ];
    super({
      actionName: 'change',
      summary: 'Records changes made to projects, indicating how the package version number should be bumped ' +
        'for the next publish.',
      documentation: documentation.join(os.EOL),
      safeForSimultaneousRushProcesses: true,
      parser
    });
  }

  public onDefineParameters(): void {
    const BULK_LONG_NAME: string = '--bulk';
    const BULK_MESSAGE_LONG_NAME: string = '--message';
    const BULK_BUMP_TYPE_LONG_NAME: string = '--bump-type';

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
      description: 'If this parameter is specified, compare the checked out branch with the specified branch to' +
        'determine which projects were changed. If this parameter is not specified, the checked out branch ' +
        'is compared against the "master" branch.'
    });

    this._overwriteFlagParemter = this.defineFlagParameter({
      parameterLongName: '--overwrite',
      description: `If a changefile already exists, overwrite without prompting ` +
        `(or erroring in ${BULK_LONG_NAME} mode).`
    });

    this._changeEmailParameter = this.defineStringParameter({
      parameterLongName: '--email',
      argumentName: 'EMAIL',
      description: 'The email address to use in changefiles. If this parameter is not provided, the email address ' +
        'will be detected or prompted for in intractive mode.'
    });

    this._bulkChangeParameter = this.defineFlagParameter({
      parameterLongName: BULK_LONG_NAME,
      description: 'If this flag is specified, apply the same change message and bump type to all changed projects. ' +
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
      alternatives: [...Object.keys(this._getBumpOptions()), ChangeType[ChangeType.none]],
      description: `The bump type to apply to all changed projects if the ${BULK_LONG_NAME} flag is provided.`
    });
  }

  public run(): Promise<void> {
    console.log(`The target branch is ${this._targetBranch}`);
    this._projectHostMap = this._generateHostMap();

    if (this._verifyParameter.value) {
      const errors: string[] = ([
        this._bulkChangeParameter,
        this._bulkChangeMessageParameter,
        this._bulkChangeBumpTypeParameter,
        this._overwriteFlagParemter
      ]).map((parameter) => {
        return parameter.value
        ? (
          `The {${this._bulkChangeParameter.longName} parameter cannot be provided with the ` +
            `${this._verifyParameter.longName} parameter`
          )
        : '';
      }).filter((error) => error !== '');
      if (errors.length > 0) {
        errors.forEach((error) => console.error(error));
        throw new AlreadyReportedError();
      }

      this._verify();
      return Promise.resolve();
    }

    const sortedProjectList: string[] = this._getChangedPackageNames().sort();
    if (sortedProjectList.length === 0) {
      this._logNoChangeFileRequired();
      this._warnUncommittedChanges();
      return Promise.resolve();
    }

    this._warnUncommittedChanges();

    let changeFileDataPromise: Promise<Map<string, IChangeFile>>;
    let allowOverwriteHandler: (filePath: string) => Promise<boolean>;
    if (this._bulkChangeParameter.value) {
      if (
        !this._bulkChangeBumpTypeParameter.value ||
        (
          !this._bulkChangeMessageParameter.value &&
          this._bulkChangeBumpTypeParameter.value !== ChangeType[ChangeType.none]
        )
      ) {
        throw new Error(
          `The ${this._bulkChangeBumpTypeParameter.longName} and ${this._bulkChangeMessageParameter.longName} ` +
          `parameters must provided if the ${this._bulkChangeParameter.longName} flag is provided. If the value ` +
          `"${ChangeType[ChangeType.none]}" is provided to the ${this._bulkChangeBumpTypeParameter.longName} ` +
          `patameter, the ${this._bulkChangeMessageParameter.longName} parameter may be omitted.`
        );
      }

      const email: string | undefined = this._changeEmailParameter.value || this._detectEmail();
      if (!email) {
        throw new Error(
          'Unable to detect git email and an email address wasn\'t provided on the ' +
          `${this._changeEmailParameter.longName} paramter.`
        );
      }

      const errors: string[] = [];

      const comment: string = this._bulkChangeMessageParameter.value || '';
      const changeType: string = this._bulkChangeBumpTypeParameter.value;
      const changeFileData: Map<string, IChangeFile> = new Map<string, IChangeFile>();
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

        changeFileData.set(
          packageName,
          {
            changes: [
              {
                comment,
                changeType: projectChangeType,
                packageName
              } as unknown as IChangeInfo
            ],
            packageName,
            email
          }
        );
      }

      if (errors.length > 0) {
        for (const error of errors) {
          console.error(error);
        }
        throw new AlreadyReportedError();
      }

      changeFileDataPromise = Promise.resolve(changeFileData);
      allowOverwriteHandler = (filePath: string) => Promise.reject(new Error(`Changefile ${filePath} already exists`));
    } else if (this._bulkChangeBumpTypeParameter.value || this._bulkChangeMessageParameter.value) {
      throw new Error(
        `The ${this._bulkChangeParameter.longName} flag must be provided with the ` +
        `${this._bulkChangeBumpTypeParameter.longName} and ${this._bulkChangeMessageParameter.longName} parameters.`
      );
    } else {
      this._prompt = inquirer.createPromptModule();
      this._changeComments = ChangeFiles.getChangeComments(this._getChangeFiles());
      changeFileDataPromise = this._promptForChangeFileData(sortedProjectList).then((changeFileData) => {
        const emailPromise: Promise<string> = this._changeEmailParameter.value
          ? Promise.resolve(this._changeEmailParameter.value)
          : this._detectOrAskForEmail();

        return emailPromise.then((email: string) => {
          changeFileData.forEach((changeFile: IChangeFile) => {
            changeFile.email = email;
          });
        }).then(() => changeFileData);
      });

      allowOverwriteHandler = (filePath) => {
        return this._prompt([
          {
            name: 'overwrite',
            type: 'confirm',
            message: `Overwrite ${filePath}?`
          }
        ]).then(({ overwrite }) => {
          if (overwrite) {
            return true;
          } else {
            console.log(`Not overwriting ${filePath}`);
            return false;
          }
        });
      };
    }

    if (this._overwriteFlagParemter.value) {
      allowOverwriteHandler = () => Promise.resolve(true);
    }

    return changeFileDataPromise.then((changeFileData) => {
      return this._writeChangeFiles(changeFileData, allowOverwriteHandler);
    }).catch((error: Error) => {
      throw new Error(`There was an error creating a change file: ${error.toString()}`);
    });
  }

  private _generateHostMap(): Map<string, string> {
    const hostMap: Map<string, string> = new Map<string, string>();
    this.rushConfiguration.projects.forEach(project => {
      let hostProjectName: string = project.packageName;
      if (project.versionPolicy && project.versionPolicy.isLockstepped) {
        const lockstepPolicy: LockStepVersionPolicy = project.versionPolicy as LockStepVersionPolicy;
        hostProjectName = lockstepPolicy.mainProject || project.packageName;
      }
      hostMap.set(project.packageName, hostProjectName);
    });
    return hostMap;
  }

  private _verify(): void {
    const changedPackages: string[] = this._getChangedPackageNames();

    if (changedPackages.length > 0) {
      this._validateChangeFile(changedPackages);
    } else {
      this._logNoChangeFileRequired();
    }
  }

  private get _targetBranch(): string {
    if (!this._targetBranchName) {
      this._targetBranchName = (
        this._targetBranchParameter.value || VersionControl.getRemoteMasterBranch(this.rushConfiguration.repositoryUrl)
      );
    }

    return this._targetBranchName;
  }

  private _getChangedPackageNames(): string[] {
    const changedFolders: Array<string | undefined> | undefined = VersionControl.getChangedFolders(
      this._targetBranch,
      this._noFetchParameter.value
    );
    if (!changedFolders) {
      return [];
    }
    const changedPackageNames: Set<string> = new Set<string>();

    this.rushConfiguration.projects
      .filter(project => project.shouldPublish)
      .filter(project => !project.versionPolicy || !project.versionPolicy.exemptFromRushChange)
      .filter(project => this._hasProjectChanged(changedFolders, project))
      .forEach(project => {
        const hostName: string | undefined = this._projectHostMap.get(project.packageName);
        if (hostName) {
          changedPackageNames.add(hostName);
        }
      });
    return [...changedPackageNames];
  }

  private _validateChangeFile(changedPackages: string[]): void {
    const files: string[] = this._getChangeFiles();
    ChangeFiles.validate(files, changedPackages, this.rushConfiguration);
  }

  private _getChangeFiles(): string[] {
    return VersionControl.getChangedFiles(this._targetBranch, true, `common/changes/`).map(relativePath => {
      return path.join(this.rushConfiguration.rushJsonFolder, relativePath);
    });
  }

  private _hasProjectChanged(changedFolders: Array<string | undefined>,
    project: RushConfigurationProject): boolean {
    let normalizedFolder: string = project.projectRelativeFolder;
    if (normalizedFolder.charAt(normalizedFolder.length - 1) !== '/') {
      normalizedFolder = normalizedFolder + '/';
    }
    const pathRegex: RegExp = new RegExp(`^${normalizedFolder}`, 'i');
    for (const folder of changedFolders) {
      if (folder && folder.match(pathRegex)) {
        return true;
      }
    }
    return false;
  }

  /**
   * The main loop which prompts the user for information on changed projects.
   */
  private _promptForChangeFileData(sortedProjectList: string[]): Promise<Map<string, IChangeFile>> {
    const changedFileData: Map<string, IChangeFile> = new Map<string, IChangeFile>();

    let promptPromise: Promise<void> = Promise.resolve();
    for (const projectName of sortedProjectList) {
      promptPromise = promptPromise
        .then(() => this._askQuestions(projectName))
        .then((answers: IChangeInfo) => {
          if (answers) {
            // Save the info into the change file
            let changeFile: IChangeFile | undefined = changedFileData.get(answers.packageName);
            if (!changeFile) {
              changeFile = {
                changes: [],
                packageName: answers.packageName,
                email: undefined
              };
              changedFileData.set(answers.packageName, changeFile!);
            }
            changeFile!.changes.push(answers);
          }
        });
    }

    return promptPromise.then(() => changedFileData);
  }

  /**
   * Asks all questions which are needed to generate changelist for a project.
   */
  private _askQuestions(packageName: string): Promise<IChangeInfo | undefined> {
    console.log(`${os.EOL}${packageName}`);
    const comments: string[] | undefined = this._changeComments.get(packageName);
    if (comments) {
      console.log(`Found existing comments:`);
      comments.forEach(comment => {
        console.log(`    > ${comment}`);
      });
      return this._prompt({
        name: 'appendComment',
        type: 'list',
        default: 'skip',
        message: 'Append to existing comments or skip?',
        choices: [
          {
            'name': 'Skip',
            'value': 'skip'
          },
          {
            'name': 'Append',
            'value': 'append'
          }
        ]
      })
      .then(({ appendComment }: { appendComment: 'skip' | 'append' }) => {
        if (appendComment === 'skip') {
          return undefined;
        } else {
          return this._promptForComments(packageName);
        }
      });
    } else {
      return this._promptForComments(packageName);
    }
  }

  private _promptForComments(packageName: string): Promise<IChangeInfo | undefined> {
    const bumpOptions: { [type: string]: string } = this._getBumpOptions(packageName);
    return this._prompt({
      name: 'comment',
      type: 'input',
      message: `Describe changes, or ENTER if no changes:`
    })
    .then(({ comment }: { comment: string }) => {
      if (Object.keys(bumpOptions).length === 0 || !comment) {
        return {
          packageName: packageName,
          comment: comment || '',
          type: ChangeType[ChangeType.none]
        } as IChangeInfo;
      } else {
        return this._prompt({
          choices: Object.keys(bumpOptions).map(option => {
            return {
              'value': option,
              'name': bumpOptions[option]
            };
          }),
          default: 'patch',
          message: 'Select the type of change:',
          name: 'bumpType',
          type: 'list'
        }).then(({ bumpType }: { bumpType: string }) => {
          return {
            packageName: packageName,
            comment: comment,
            type: bumpType
          } as IChangeInfo;
        });
      }
    });
  }

  private _getBumpOptions(packageName?: string): { [type: string]: string } {
    let bumpOptions: { [type: string]: string } = (this.rushConfiguration && this.rushConfiguration.hotfixChangeEnabled)
      ? {
          [ChangeType[ChangeType.hotfix]]: 'hotfix - for changes that need to be published in a separate hotfix package'
        }
      : {
          [ChangeType[ChangeType.major]]: 'major - for changes that break compatibility, e.g. removing an API',
          [ChangeType[ChangeType.minor]]: 'minor - for backwards compatible changes, e.g. adding a new API',
          [ChangeType[ChangeType.patch]]: 'patch - for changes that do not affect compatibility, e.g. fixing a bug'
        };

    if (packageName) {
      const project: RushConfigurationProject | undefined = this.rushConfiguration.getProjectByName(packageName);
      const versionPolicy: VersionPolicy | undefined = project!.versionPolicy;

      if (versionPolicy) {
        if (versionPolicy.definitionName === VersionPolicyDefinitionName.lockStepVersion) {
          // No need to ask for bump types if project is lockstep versioned.
          bumpOptions = {};
        } else if (versionPolicy.definitionName === VersionPolicyDefinitionName.individualVersion) {
          const individualPolicy: IndividualVersionPolicy = versionPolicy as IndividualVersionPolicy;
          if (individualPolicy.lockedMajor !== undefined) {
            // tslint:disable-next-line:no-string-literal
            delete bumpOptions[ChangeType.major];
          }
        }
      }
    }

    return bumpOptions;
  }

  /**
   * Will determine a user's email by first detecting it from their git config,
   * or will ask for it if it is not found or the git config is wrong.
   */
  private _detectOrAskForEmail(): Promise<string> {
    return this._detectAndConfirmEmail().then((email: string) => {
      if (email) {
        return Promise.resolve(email);
      } else {
        return this._promptForEmail();
      }
    });
  }

  private _detectEmail(): string | undefined {
    try {
      return child_process.execSync('git config user.email')
        .toString()
        .replace(/(\r\n|\n|\r)/gm, '');
    } catch (err) {
      console.log('There was an issue detecting your Git email...');
      return undefined;
    }
  }

  /**
   * Detects the user's email address from their git configuration, prompts the user to approve the
   * detected email. It returns undefined if it cannot be detected.
   */
  private _detectAndConfirmEmail(): Promise<string | undefined> {
    const email: string | undefined = this._detectEmail();

    if (email) {
      return this._prompt([
        {
          type: 'confirm',
          name: 'isCorrectEmail',
          default: 'Y',
          message: `Is your email address ${email}?`
        }
      ]).then(({ isCorrectEmail }: { isCorrectEmail: boolean }) => {
        return isCorrectEmail ? email : undefined;
      });
    } else {
      return Promise.resolve(undefined);
    }
  }

  /**
   * Asks the user for their email address
   */
  private _promptForEmail(): Promise<string> {
    return this._prompt([
      {
        type: 'input',
        name: 'email',
        message: 'What is your email address?',
        validate: (input: string) => {
          return true; // @todo should be an email
        }
      }
    ])
    .then(({ email }) => email);
  }

  private _warnUncommittedChanges(): void {
    try {
      if (VersionControl.hasUncommittedChanges()) {
        console.log(
          os.EOL +
          colors.yellow(
            'Warning: You have uncommitted changes, which do not trigger prompting for change ' +
            'descriptions.'
          )
        );
      }
    } catch (error) {
      console.log(`An error occurred when detecting uncommitted changes: ${error}`);
    }
  }

  /**
   * Writes change files to the common/changes folder. Will prompt for overwrite if file already exists.
   */
  private _writeChangeFiles(
    changeFileData: Map<string, IChangeFile>,
    allowOverwriteHandler: (filePath: string) => Promise<boolean>
  ): Promise<void> {
    let writePromise: Promise<void> = Promise.resolve();
    changeFileData.forEach((changeFile: IChangeFile) => {
      writePromise = writePromise.then(() => this._writeChangeFile(changeFile, allowOverwriteHandler));
    });

    return writePromise;
  }

  private _writeChangeFile(
    changeFileData: IChangeFile,
    allowOverwriteHandler: (filePath: string) => Promise<boolean>
  ): Promise<void> {
    const output: string = JSON.stringify(changeFileData, undefined, 2);
    const changeFile: ChangeFile = new ChangeFile(changeFileData, this.rushConfiguration);
    const filePath: string = changeFile.generatePath();

    const fileExists: boolean = FileSystem.exists(filePath);
    const overwriteCheckPromise: Promise<boolean> = fileExists
      ? allowOverwriteHandler(filePath)
      : Promise.resolve(true);
    return overwriteCheckPromise.then((shouldWrite) => {
      if (shouldWrite) {
        this._writeFile(filePath, output, shouldWrite && fileExists);
      }
    });
  }

  /**
   * Writes a file to disk, ensuring the directory structure up to that point exists
   */
  private _writeFile(fileName: string, output: string, isOverwrite: boolean): void {
    FileSystem.writeFile(fileName, output, { ensureFolderExists: true });
    if (isOverwrite) {
      console.log(`Overwrote file: ${fileName}`);
    } else {
      console.log(`Created file: ${fileName}`);
    }
  }

  private _logNoChangeFileRequired(): void {
    console.log('No changes were detected to relevant packages on this branch. Nothing to do.');
  }
}
