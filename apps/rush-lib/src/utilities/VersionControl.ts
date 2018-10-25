// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'child_process';

export class VersionControl {
  public static getChangedFolders(targetBranch?: string): Array<string | undefined> | undefined {
    const branchName: string = targetBranch ? targetBranch : 'origin/master';
    const output: string | undefined = child_process.execSync(`git diff ${branchName}... --dirstat=files,0`)
      .toString();
    return output.split('\n').map(s => {
      if (s) {
        const delimiterIndex: number = s.indexOf('%');
        if (delimiterIndex > 0 && delimiterIndex + 1 < s.length) {
          return s.substring(delimiterIndex + 1).trim();
        }
      }
      return undefined;
    });
  }

  public static getChangedFiles(prefix?: string, targetBranch?: string): string[] {
    const branchName: string = targetBranch ? targetBranch : 'origin/master';
    const output: string = child_process
      .execSync(`git diff ${branchName}... --name-only --no-renames --diff-filter=A`)
      .toString();
    const regex: RegExp | undefined = prefix ? new RegExp(`^${prefix}`, 'i') : undefined;
    return output.split('\n').map(s => {
      if (s) {
        const trimmedLine: string = s.trim();
        if (regex && trimmedLine.match(regex)) {
          return trimmedLine;
        }
      }
      return undefined;
    }).filter(s => {
      return s && s.length > 0;
    }) as string[];
  }

  /**
   * Gets the remote master branch that maps to the provided repository url.
   * This method is used by 'Rush change' to find the default remote branch to compare against.
   * If repository url is not provided or if there is no match, returns the default remote
   * master branch 'origin/master'.
   * If there are more than one matches, returns the first remote's master branch.
   *
   * @param repositoryUrl - repository url
   */
  public static getRemoteMasterBranch(repositoryUrl?: string): string {
    const defaultRemote: string = 'origin';
    const defaultMaster: string = 'origin/master';
    let useDefault: boolean = false;
    let matchingRemotes: string[] = [];

    if (!repositoryUrl) {
      useDefault = true;
    } else {
      const output: string = child_process
      .execSync(`git remote`)
      .toString();
      matchingRemotes = output.split('\n').filter(remoteName => {
        if (remoteName) {
          const remoteUrl: string = child_process.execSync(`git remote get-url ${remoteName}`)
            .toString()
            .trim();
          if (remoteName === defaultRemote && remoteUrl === repositoryUrl) {
            useDefault = true;
          }
          return remoteUrl === repositoryUrl;
        }
        return false;
      });
    }

    if (useDefault) {
      return defaultMaster;
    } else if (matchingRemotes.length > 0) {
      if (matchingRemotes.length > 1) {
        console.log(`More than one remotes match the repository url. Use the first remote.`);
      }
      return `${matchingRemotes[0]}/master`;
    }
    // For backward-compatible
    return defaultMaster;
  }

  public static hasUncommittedChanges(): boolean {
    return VersionControl.getUncommittedChanges().length > 0;
  }

  /**
   * The list of files changed but not commited
   */
  public static getUncommittedChanges(): ReadonlyArray<string> {
    const changes: string[] = [];
    changes.push(...VersionControl._getUntrackedChanges());
    changes.push(...VersionControl._getDiffOnHEAD());

    return changes.filter(change => {
      return change.trim().length > 0;
    });
  }

  private static _getUntrackedChanges(): string[] {
    const output: string = child_process
      .execSync(`git ls-files --exclude-standard --others`)
      .toString();
    return output.trim().split('\n');
  }

  private static _getDiffOnHEAD(): string[] {
    const output: string = child_process
      .execSync(`git diff HEAD --name-only`)
      .toString();
    return output.trim().split('\n');
  }
}
