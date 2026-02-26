// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'node:child_process';
import * as path from 'node:path';

import type {
  IPublishProvider,
  IPublishProviderPublishOptions,
  IPublishProviderPackOptions,
  IPublishProviderCheckExistsOptions
} from '@rushstack/rush-sdk';

/**
 * Configuration options for the VSIX publish provider, read from
 * the `providers.vsix` section of `config/rush-publish.json`.
 */
export interface IVsixProviderConfig {
  /**
   * Glob pattern for locating the VSIX file relative to the project's publish folder.
   * @defaultValue 'dist/vsix/extension.vsix'
   */
  vsixPathPattern?: string;

  /**
   * If true, use Azure credential-based authentication with vsce.
   * @defaultValue true
   */
  useAzureCredential?: boolean;
}

const DEFAULT_VSIX_PATH_PATTERN: string = 'dist/vsix/extension.vsix';

/**
 * Publish provider that publishes VSIX packages to the VS Code Marketplace
 * using the @vscode/vsce CLI.
 * @public
 */
export class VsixPublishProvider implements IPublishProvider {
  public readonly providerName: string = 'vsix';

  public async publishAsync(options: IPublishProviderPublishOptions): Promise<void> {
    const { projects, dryRun, logger } = options;

    for (const projectInfo of projects) {
      const { project, newVersion, providerConfig } = projectInfo;
      const config: IVsixProviderConfig = (providerConfig as IVsixProviderConfig) || {};

      const packageName: string = project.packageName;
      const publishFolder: string = project.publishFolder;

      const vsixPathPattern: string = config.vsixPathPattern || DEFAULT_VSIX_PATH_PATTERN;
      const vsixPath: string = path.resolve(publishFolder, vsixPathPattern);
      const useAzureCredential: boolean = config.useAzureCredential !== false;

      logger.terminal.writeLine(`Publishing ${packageName}@${newVersion} to VS Code Marketplace...`);

      const args: string[] = ['publish', '--no-dependencies', '--packagePath', vsixPath];

      if (useAzureCredential) {
        args.push('--azure-credential');
      }

      if (dryRun) {
        logger.terminal.writeLine(`  [DRY RUN] Would execute: vsce ${args.join(' ')}`);
        logger.terminal.writeLine(`  Working directory: ${publishFolder}`);
      } else {
        await this._executeVsceAsync(args, publishFolder);
        logger.terminal.writeLine(`  Successfully published ${packageName}@${newVersion} to Marketplace`);
      }
    }
  }

  public async packAsync(options: IPublishProviderPackOptions): Promise<void> {
    const { projects, releaseFolder, dryRun, logger } = options;

    for (const projectInfo of projects) {
      const { project, newVersion } = projectInfo;

      const packageName: string = project.packageName;
      const publishFolder: string = project.publishFolder;

      // Determine the output VSIX filename
      const vsixFileName: string = `${packageName.replace(/[/@]/g, '-')}-${newVersion}.vsix`;
      const outputPath: string = path.join(releaseFolder, vsixFileName);

      logger.terminal.writeLine(`Packing ${packageName}@${newVersion} as VSIX...`);

      // vsce package --out <path>
      const args: string[] = ['package', '--no-dependencies', '--out', outputPath];

      if (dryRun) {
        logger.terminal.writeLine(`  [DRY RUN] Would execute: vsce ${args.join(' ')}`);
        logger.terminal.writeLine(`  Working directory: ${publishFolder}`);
      } else {
        await this._executeVsceAsync(args, publishFolder);
        logger.terminal.writeLine(`  Packed ${packageName}@${newVersion} to ${vsixFileName}`);
      }
    }
  }

  /**
   * The VS Code Marketplace does not provide a simple version-check API,
   * so this always returns false (allowing publish to proceed).
   */
  public async checkExistsAsync(options: IPublishProviderCheckExistsOptions): Promise<boolean> {
    return false;
  }

  /**
   * Execute the vsce CLI as a child process.
   */
  private async _executeVsceAsync(args: string[], workingDirectory: string): Promise<void> {
    // Resolve vsce from the project's node_modules
    const vsceCommand: string = process.platform === 'win32' ? 'vsce.cmd' : 'vsce';

    return new Promise<void>((resolve, reject) => {
      const child: childProcess.ChildProcess = childProcess.spawn(vsceCommand, args, {
        cwd: workingDirectory,
        stdio: 'inherit'
      });

      child.on('close', (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command "vsce ${args.join(' ')}" exited with code ${code}`));
        }
      });

      child.on('error', (error: Error) => {
        reject(error);
      });
    });
  }
}
