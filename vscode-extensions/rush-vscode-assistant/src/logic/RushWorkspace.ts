import * as vscode from 'vscode';
import { terminal } from './logger';

import type { CommandLineAction } from '@rushstack/ts-command-line/lib/providers/CommandLineAction';
import type * as RushLib from '@rushstack/rush-sdk';

import * as rushSdk from '@rushstack/rush-sdk';

// eslint-disable-next-line @typescript-eslint/naming-convention
// declare let ___DEV___: boolean;
declare const global: NodeJS.Global &
  typeof globalThis & {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ___rush___workingDirectory?: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention
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
  private _rushCommandLineParser: RushLib.RushCommandLineParser | undefined;
  private static _rushWorkspace: RushWorkspace | undefined;

  private static readonly _onDidChangeWorkspace: vscode.EventEmitter<RushWorkspace> =
    new vscode.EventEmitter();
  public static readonly onDidChangeWorkspace: vscode.Event<RushWorkspace> =
    RushWorkspace._onDidChangeWorkspace.event;

  private constructor({ rushLib, startingFolder }: IRushWorkspace) {
    this._rushLib = rushLib;
    this._startingFolderPath = startingFolder;
    const { RushConfiguration, RushCommandLineParser } = rushLib;
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
    terminal.writeWarningLine(`rushConfiguration loaded from: ${startingFolder}`);
    this._rushConfiguration = rushConfiguration;

    if (RushCommandLineParser) {
      this._rushCommandLineParser = new RushCommandLineParser({
        cwd: startingFolder
      });
    } else {
      terminal.writeWarningLine(`load RushCommandLineParser from rush-sdk failed`);
    }

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
    workspaceFolderPath: string
  ): Promise<RushWorkspace | undefined> {
    terminal.writeWarningLine(`initialize from workspaceFolderPath: ${JSON.stringify(workspaceFolderPath)}`);

    if (true) {
      try {
        terminal.writeLine('[DEV MODE] try to load @microsoft/rush-lib instead of @rushstack/rush-sdk');
        global.___rush___rushLibModule = (await import('@microsoft/rush-lib')) as unknown as typeof RushLib;
      } catch (e) {
        terminal.writeErrorLine(`Failed to load dev rush lib @microsoft/rush-lib`);
      }
    }

    terminal.writeWarningLine(`current workspaceFolderPath: ${workspaceFolderPath}`);

    let rushLib: typeof RushLib | undefined;
    try {
      global.___rush___workingDirectory = workspaceFolderPath;
      // rushLib = await import('@rushstack/rush-sdk');
      // rushLib = (await import('@rushstack/rush-sdk')) as unknown as typeof RushLib;
      // terminal.writeWarningLine('rush lib: ', String(rushLib));
      const rushConfigLoc: string = rushSdk.RushConfiguration.tryFindRushJsonLocation() as string;
      terminal.writeWarningLine('Rush config loc: ', rushConfigLoc);
      if (!rushLib) {
        return undefined;
      }
    } catch (e) {
      terminal.writeWarningLine('Could not load the @rushstack/rush-sdk', JSON.stringify(e));
      return undefined;
    }
    try {
      return new RushWorkspace({ rushLib, startingFolder: workspaceFolderPath });
    } catch (e) {
      terminal.writeWarningLine(`Failed to initialize workspace from ${workspaceFolderPath}: ${e}`);
    }

    terminal.writeWarningLine(`RushWorkspace has not been ininitialized from current workspace folders`);
    return undefined;
  }

  public static async selectWorkspace(): Promise<RushWorkspace | undefined> {
    if (vscode.workspace.workspaceFolders !== undefined) {
      const wf = vscode.workspace.workspaceFolders[0].uri.path;
      return await RushWorkspace.initializeFromWorkspaceFolderPathsAsync(wf);
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
