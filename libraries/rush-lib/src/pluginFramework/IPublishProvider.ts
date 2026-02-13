// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import type { ChangeType } from '../api/ChangeManagement';
import type { ILogger } from './logging/Logger';

/**
 * Information about a single project to be published by a publish provider.
 * @beta
 */
export interface IPublishProjectInfo {
  /**
   * The Rush project configuration for this project.
   */
  readonly project: RushConfigurationProject;

  /**
   * The new version that has been assigned to this project.
   */
  readonly newVersion: string;

  /**
   * The previous version before the version bump.
   */
  readonly previousVersion: string;

  /**
   * The type of change (patch, minor, major, etc.) that triggered the version bump.
   */
  readonly changeType: ChangeType;

  /**
   * Provider-specific configuration from config/publish.json for this project.
   * This is the value of the `providers[targetName]` section.
   */
  readonly providerConfig: Record<string, unknown> | undefined;
}

/**
 * Options passed to {@link IPublishProvider.publishAsync}.
 * @beta
 */
export interface IPublishProviderPublishOptions {
  /**
   * The set of projects to be published by this provider.
   */
  readonly projects: ReadonlyArray<IPublishProjectInfo>;

  /**
   * The distribution tag to use when publishing (e.g. 'latest', 'next').
   */
  readonly tag: string | undefined;

  /**
   * If true, the provider should perform all steps except the actual publish,
   * logging what would have been done.
   */
  readonly dryRun: boolean;

  /**
   * A logger instance for reporting progress and errors.
   */
  readonly logger: ILogger;
}

/**
 * Options passed to {@link IPublishProvider.checkExistsAsync}.
 * @beta
 */
export interface IPublishProviderCheckExistsOptions {
  /**
   * The Rush project to check.
   */
  readonly project: RushConfigurationProject;

  /**
   * The version to check for existence.
   */
  readonly version: string;

  /**
   * Provider-specific configuration from config/publish.json for this project.
   */
  readonly providerConfig: Record<string, unknown> | undefined;
}

/**
 * Options passed to {@link IPublishProvider.packAsync}.
 * @beta
 */
export interface IPublishProviderPackOptions {
  /**
   * The set of projects to pack.
   */
  readonly projects: ReadonlyArray<IPublishProjectInfo>;

  /**
   * The folder where packed artifacts should be placed.
   * Corresponds to the `--release-folder` CLI parameter.
   * When not specified, a default location is used
   * (e.g., `<commonTempFolder>/artifacts/packages`).
   */
  readonly releaseFolder: string;

  /**
   * If true, the provider should perform all steps except the actual pack,
   * logging what would have been done.
   */
  readonly dryRun: boolean;

  /**
   * A logger instance for reporting progress and errors.
   */
  readonly logger: ILogger;
}

/**
 * Interface for publish providers that handle publishing packages to a specific target
 * (e.g. npm registry, VS Code Marketplace).
 *
 * @remarks
 * Plugins implement this interface and register a factory via
 * {@link RushSession.registerPublishProviderFactory}.
 *
 * @beta
 */
export interface IPublishProvider {
  /**
   * A human-readable name identifying the publish target (e.g. 'npm', 'vsix').
   */
  readonly providerName: string;

  /**
   * Publishes the specified projects to this provider's target.
   */
  publishAsync(options: IPublishProviderPublishOptions): Promise<void>;

  /**
   * Packs the specified projects into distributable artifacts for this provider's target.
   * Each provider defines what "packing" means for its artifact type:
   * - npm: runs `<packageManager> pack` to produce a `.tgz` tarball
   * - vsix: runs `vsce package` to produce a `.vsix` file
   *
   * Artifacts are written to the `releaseFolder` specified in options.
   */
  packAsync(options: IPublishProviderPackOptions): Promise<void>;

  /**
   * Checks whether a specific version of a project already exists at the publish target.
   * Returns true if the version is already published.
   */
  checkExistsAsync(options: IPublishProviderCheckExistsOptions): Promise<boolean>;
}

/**
 * A factory function that creates an {@link IPublishProvider} instance.
 *
 * @remarks
 * Publish provider plugins register a factory of this type via
 * {@link RushSession.registerPublishProviderFactory}.
 *
 * @beta
 */
export type PublishProviderFactory = () => Promise<IPublishProvider>;
