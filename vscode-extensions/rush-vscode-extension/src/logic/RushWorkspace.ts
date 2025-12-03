// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushSdkLoader, type ISdkCallbackEvent } from '@rushstack/rush-sdk/loader';

import * as vscode from 'vscode';
import { terminal } from './logger';

import type { CommandLineAction } from '@rushstack/rush-vscode-command-webview';
import type * as RushLib from '@rushstack/rush-sdk';
import type * as RushCommandLine from '@rushstack/ts-command-line';

// eslint-disable-next-line @typescript-eslint/naming-convention
declare let ___DEV___: boolean;
declare const global: NodeJS.Global &
  typeof globalThis & {
    ___rush___rushLibModule?: typeof RushLib;
  };

export interface IRushWorkspace {
  rushLib: typeof RushLib;
  startingFolder: string;
}

export class RushWorkspace {
  private _rushLib: typeof RushLib | undefined;
  private _startingFolderPath: string;
  private _rushConfiguration: RushLib.RushConfiguration;
  private _rushCommandLineParser: RushCommandLine.CommandLineParser | undefined;
  private static _rushWorkspace: RushWorkspace | undefined;

  private static readonly _onDidChangeWorkspace: vscode.EventEmitter<RushWorkspace> =
    new vscode.EventEmitter();
  public static readonly onDidChangeWorkspace: vscode.Event<RushWorkspace> =
    RushWorkspace._onDidChangeWorkspace.event;

  private constructor({ rushLib, startingFolder }: IRushWorkspace) {
    this._rushLib = rushLib;
    this._startingFolderPath = startingFolder;
    const { RushConfiguration } = rushLib;
    // existence check for API
    if (!RushConfiguration) {
      throw new Error('load RushConfiguration from rush-sdk failed');
    }
    const rushConfiguration: RushLib.RushConfiguration | undefined =
      RushConfiguration.loadFromDefaultLocation({
        startingFolder
      });
    if (!rushConfiguration) {
      throw new Error('RushConfiguration not found');
    }
    terminal.writeDebugLine(`rushConfiguration loaded from: ${startingFolder}`);
    this._rushConfiguration = rushConfiguration;

    // if (RushCommandLine) {
    //   this._rushCommandLineParser = new RushCommandLine({
    //     cwd: startingFolder
    //   });
    // } else {
    //   terminal.writeWarningLine(`load RushCommandLineParser from rush-sdk failed`);
    // }

    RushWorkspace._rushWorkspace = this;
    RushWorkspace._onDidChangeWorkspace.fire(this);
  }

  public static getCurrentInstance(): RushWorkspace {
    if (!RushWorkspace._rushWorkspace) {
      throw new Error('RushWorkspace not initialized');
    }
    return RushWorkspace._rushWorkspace;
  }

  public static async initializeFromWorkspaceFolderPathsAsync(
    workspaceFolderPaths: string[]
  ): Promise<RushWorkspace | undefined> {
    terminal.writeDebugLine(`initialize from workspaceFolderPaths: ${JSON.stringify(workspaceFolderPaths)}`);

    if (___DEV___) {
      try {
        terminal.writeLine('[DEV MODE] try to load @microsoft/rush-lib instead of @rushstack/rush-sdk');
        global.___rush___rushLibModule = (await import('@microsoft/rush-lib')) as unknown as typeof RushLib;
      } catch (e) {
        terminal.writeErrorLine(`Failed to load dev rush lib @microsoft/rush-lib`);
      }
    }

    terminal.writeDebugLine(`current workspaceFolderPaths: ${workspaceFolderPaths.join(',')}`);

    for (const folderPath of workspaceFolderPaths) {
      let rushLib: typeof RushLib | undefined;
      try {
        if (!RushSdkLoader.isLoaded) {
          await RushSdkLoader.loadAsync({
            rushJsonSearchFolder: folderPath,
            onNotifyEvent: (event: ISdkCallbackEvent) => {
              if (event.logMessage) {
                terminal.writeDebugLine(event.logMessage.text);
              }
            }
          });
        }
        rushLib = await import('@rushstack/rush-sdk');

        if (!rushLib) {
          continue;
        }
      } catch (e) {
        continue;
      }
      try {
        return new RushWorkspace({ rushLib, startingFolder: folderPath });
      } catch (e) {
        terminal.writeDebugLine(`Failed to initialize workspace from ${folderPath}: ${e}`);
        continue;
      }
    }
    terminal.writeWarningLine(`RushWorkspace has not been initialized from current workspace folders`);
    return undefined;
  }

  public static async selectWorkspaceAsync(): Promise<RushWorkspace | undefined> {
    const Uris: vscode.Uri[] | undefined = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: 'Select workspace folder'
    });
    if (Uris && Uris[0]) {
      return await RushWorkspace.initializeFromWorkspaceFolderPathsAsync([Uris[0].fsPath]);
    }
    return undefined;
  }

  public get rushConfiguration(): RushLib.RushConfiguration {
    return this._rushConfiguration;
  }

  public get workspaceRootPath(): string {
    return this._rushConfiguration.rushJsonFolder;
  }

  public get commandLineActions(): CommandLineAction[] {
    return (this._rushCommandLineParser?.actions || []).slice() as unknown as CommandLineAction[];
  }
}
