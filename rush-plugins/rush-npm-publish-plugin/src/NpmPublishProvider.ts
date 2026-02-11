// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'node:child_process';
import * as path from 'node:path';
import * as os from 'node:os';

import * as semver from 'semver';

import { FileSystem } from '@rushstack/node-core-library';
import type {
  IPublishProvider,
  IPublishProviderPublishOptions,
  IPublishProviderCheckExistsOptions,
  IPublishProjectInfo
} from '@rushstack/rush-sdk';

/**
 * Configuration options for the npm publish provider, read from
 * the `providers.npm` section of `config/publish.json`.
 */
export interface INpmProviderConfig {
  registryUrl?: string;
  npmAuthToken?: string;
  tag?: string;
  access?: string;
}

/**
 * Publish provider that publishes packages to the npm registry.
 * @public
 */
export class NpmPublishProvider implements IPublishProvider {
  public readonly providerName: string = 'npm';

  public async publishAsync(options: IPublishProviderPublishOptions): Promise<void> {
    const { projects, tag, dryRun, logger } = options;

    for (const projectInfo of projects) {
      const { project, newVersion, providerConfig } = projectInfo;
      const config: INpmProviderConfig = (providerConfig as INpmProviderConfig) || {};

      const packageName: string = project.packageName;
      const publishFolder: string = project.publishFolder;

      logger.terminal.writeLine(`Publishing ${packageName}@${newVersion} to npm...`);

      const env: Record<string, string | undefined> = { ...process.env };
      const args: string[] = ['publish'];

      // Set up registry URL
      let registryPrefix: string = '//registry.npmjs.org/';
      if (config.registryUrl) {
        env.npm_config_registry = config.registryUrl;
        registryPrefix = config.registryUrl.substring(config.registryUrl.indexOf('//'));
      }

      // Set up auth token
      if (config.npmAuthToken) {
        args.push(`--${registryPrefix}:_authToken=${config.npmAuthToken}`);
      }

      // Set up npm publish home for .npmrc-publish
      this._configureNpmrcPublishHome(project.rushConfiguration, env);

      // Add tag
      const effectiveTag: string | undefined = tag || config.tag;
      if (effectiveTag) {
        args.push('--tag', effectiveTag);
      }

      // Add access level
      if (config.access) {
        args.push('--access', config.access);
      }

      // For pnpm, add --no-git-checks
      if (project.rushConfiguration.packageManager === 'pnpm') {
        args.push('--no-git-checks');
      }

      // Determine the package manager binary
      const packageManagerToolFilename: string =
        project.rushConfiguration.packageManager === 'yarn'
          ? 'npm'
          : project.rushConfiguration.packageManagerToolFilename;

      if (dryRun) {
        logger.terminal.writeLine(
          `  [DRY RUN] Would execute: ${packageManagerToolFilename} ${args.join(' ')}`
        );
        logger.terminal.writeLine(`  Working directory: ${publishFolder}`);
      } else {
        await this._executeCommandAsync(packageManagerToolFilename, args, publishFolder, env);
        logger.terminal.writeLine(`  Successfully published ${packageName}@${newVersion}`);
      }
    }
  }

  public async checkExistsAsync(options: IPublishProviderCheckExistsOptions): Promise<boolean> {
    const { project, version, providerConfig } = options;
    const config: INpmProviderConfig = (providerConfig as INpmProviderConfig) || {};

    const env: Record<string, string | undefined> = { ...process.env };
    const args: string[] = [];

    // Set up registry URL
    if (config.registryUrl) {
      env.npm_config_registry = config.registryUrl;
    }

    // Set up auth token
    if (config.npmAuthToken) {
      let registryPrefix: string = '//registry.npmjs.org/';
      if (config.registryUrl) {
        registryPrefix = config.registryUrl.substring(config.registryUrl.indexOf('//'));
      }
      args.push(`--${registryPrefix}:_authToken=${config.npmAuthToken}`);
    }

    // Set up npm publish home for .npmrc-publish
    this._configureNpmrcPublishHome(project.rushConfiguration, env);

    const publishedVersions: string[] = await this._getPublishedVersionsAsync(
      project.packageName,
      project.publishFolder,
      env,
      args
    );

    const parsedVersion: semver.SemVer | null = semver.parse(version);
    if (!parsedVersion) {
      throw new Error(`The package "${project.packageName}" has an invalid version "${version}"`);
    }

    // Normalize "1.2.3-beta.4+extra567" --> "1.2.3-beta.4"
    parsedVersion.build = [];
    const normalizedVersion: string = parsedVersion.format();

    return publishedVersions.indexOf(normalizedVersion) >= 0;
  }

  /**
   * Configure the HOME directory to use .npmrc-publish from the Rush config.
   */
  private _configureNpmrcPublishHome(
    rushConfiguration: IPublishProjectInfo['project']['rushConfiguration'],
    env: Record<string, string | undefined>
  ): void {
    const publishHomeFolder: string = path.join(rushConfiguration.commonTempFolder, 'publish-home');
    const publishHomePath: string = path.join(publishHomeFolder, '.npmrc');

    if (FileSystem.exists(publishHomePath)) {
      const userHomeEnvVariable: string = os.platform() === 'win32' ? 'USERPROFILE' : 'HOME';
      env[userHomeEnvVariable] = publishHomeFolder;
    }
  }

  /**
   * Get published versions of a package from the npm registry.
   */
  private async _getPublishedVersionsAsync(
    packageName: string,
    workingDirectory: string,
    env: Record<string, string | undefined>,
    extraArgs: string[]
  ): Promise<string[]> {
    try {
      // Use npm view to get published versions
      const args: string[] = ['view', packageName, 'versions', '--json', ...extraArgs];
      const output: string = await this._captureCommandOutputAsync('npm', args, workingDirectory, env);

      const parsed: unknown = JSON.parse(output);
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === 'string' && semver.valid(v) !== null);
      }
      if (typeof parsed === 'string' && semver.valid(parsed) !== null) {
        return [parsed];
      }
      return [];
    } catch {
      // Package doesn't exist on registry
      return [];
    }
  }

  /**
   * Execute a command as a child process.
   */
  private async _executeCommandAsync(
    command: string,
    args: string[],
    workingDirectory: string,
    env: Record<string, string | undefined>
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const child: childProcess.ChildProcess = childProcess.spawn(command, args, {
        cwd: workingDirectory,
        env: env as NodeJS.ProcessEnv,
        stdio: 'inherit'
      });

      child.on('close', (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command "${command} ${args.join(' ')}" exited with code ${code}`));
        }
      });

      child.on('error', (error: Error) => {
        reject(error);
      });
    });
  }

  /**
   * Execute a command and capture its stdout output.
   */
  private async _captureCommandOutputAsync(
    command: string,
    args: string[],
    workingDirectory: string,
    env: Record<string, string | undefined>
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const child: childProcess.ChildProcess = childProcess.spawn(command, args, {
        cwd: workingDirectory,
        env: env as NodeJS.ProcessEnv,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout: string = '';
      let stderr: string = '';

      child.stdout!.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr!.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code: number | null) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command "${command} ${args.join(' ')}" failed with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (error: Error) => {
        reject(error);
      });
    });
  }
}
