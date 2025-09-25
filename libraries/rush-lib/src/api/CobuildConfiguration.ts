// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, JsonFile, JsonSchema } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';
import { randomUUID } from 'node:crypto';

import { EnvironmentConfiguration } from './EnvironmentConfiguration';
import type { CobuildLockProviderFactory, RushSession } from '../pluginFramework/RushSession';
import { RushConstants } from '../logic/RushConstants';
import type { ICobuildLockProvider } from '../logic/cobuild/ICobuildLockProvider';
import type { RushConfiguration } from './RushConfiguration';
import schemaJson from '../schemas/cobuild.schema.json';

/**
 * @beta
 */
export interface ICobuildJson {
  cobuildFeatureEnabled: boolean;
  cobuildLockProvider: string;
}

/**
 * @beta
 */
export interface ICobuildConfigurationOptions {
  cobuildJson: ICobuildJson;
  rushConfiguration: RushConfiguration;
  rushSession: RushSession;
  cobuildLockProviderFactory: CobuildLockProviderFactory;
}

/**
 * Use this class to load and save the "common/config/rush/cobuild.json" config file.
 * This file provides configuration options for the Rush Cobuild feature.
 * @beta
 */
export class CobuildConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

  /**
   * Indicates whether the cobuild feature is enabled.
   * Typically it is enabled in the cobuild.json config file.
   *
   * Note: The orchestrator (or local users) should always have to opt into running with cobuilds by
   * providing a cobuild context id. Even if cobuilds are "enabled" as a feature, they don't
   * actually turn on for that particular build unless the cobuild context id is provided as an
   * non-empty string.
   */
  public readonly cobuildFeatureEnabled: boolean;

  /**
   * Cobuild context id
   *
   * @remarks
   * The cobuild feature won't be enabled until the context id is provided as an non-empty string.
   */
  public readonly cobuildContextId: string | undefined;

  /**
   * This is a name of the participating cobuild runner. It can be specified by the environment variable
   * RUSH_COBUILD_RUNNER_ID. If it is not provided, a random id will be generated to identify the runner.
   */
  public readonly cobuildRunnerId: string;
  /**
   * If true, Rush will automatically handle the leaf project with build cache "disabled" by writing
   * to the cache in a special "log files only mode". This is useful when you want to use Cobuilds
   * to improve the performance in CI validations and the leaf projects have not enabled cache.
   */
  public readonly cobuildLeafProjectLogOnlyAllowed: boolean;

  /**
   * If true, operations can opt into leveraging cobuilds without restoring from the build cache.
   *  Operations will need to us the allowCobuildWithoutCache flag to opt into this behavior per phase.
   */
  public readonly cobuildWithoutCacheAllowed: boolean;

  private _cobuildLockProvider: ICobuildLockProvider | undefined;
  private readonly _cobuildLockProviderFactory: CobuildLockProviderFactory;
  private readonly _cobuildJson: ICobuildJson;

  private constructor(options: ICobuildConfigurationOptions) {
    const { cobuildJson, cobuildLockProviderFactory, rushConfiguration } = options;

    this.cobuildContextId = EnvironmentConfiguration.cobuildContextId;
    this.cobuildFeatureEnabled = this.cobuildContextId ? cobuildJson.cobuildFeatureEnabled : false;
    this.cobuildRunnerId = EnvironmentConfiguration.cobuildRunnerId || randomUUID();
    this.cobuildLeafProjectLogOnlyAllowed =
      EnvironmentConfiguration.cobuildLeafProjectLogOnlyAllowed ?? false;
    this.cobuildWithoutCacheAllowed =
      rushConfiguration.experimentsConfiguration.configuration.allowCobuildWithoutCache ?? false;

    this._cobuildLockProviderFactory = cobuildLockProviderFactory;
    this._cobuildJson = cobuildJson;
  }

  /**
   * Attempts to load the cobuild.json data from the standard file path `common/config/rush/cobuild.json`.
   * If the file has not been created yet, then undefined is returned.
   */
  public static async tryLoadAsync(
    terminal: ITerminal,
    rushConfiguration: RushConfiguration,
    rushSession: RushSession
  ): Promise<CobuildConfiguration | undefined> {
    const jsonFilePath: string = CobuildConfiguration.getCobuildConfigFilePath(rushConfiguration);
    try {
      return await CobuildConfiguration._loadAsync(jsonFilePath, terminal, rushConfiguration, rushSession);
    } catch (err) {
      if (!FileSystem.isNotExistError(err)) {
        throw err;
      }
    }
  }

  public static getCobuildConfigFilePath(rushConfiguration: RushConfiguration): string {
    return `${rushConfiguration.commonRushConfigFolder}/${RushConstants.cobuildFilename}`;
  }

  private static async _loadAsync(
    jsonFilePath: string,
    terminal: ITerminal,
    rushConfiguration: RushConfiguration,
    rushSession: RushSession
  ): Promise<CobuildConfiguration | undefined> {
    let cobuildJson: ICobuildJson | undefined;
    try {
      cobuildJson = await JsonFile.loadAndValidateAsync(jsonFilePath, CobuildConfiguration._jsonSchema);
    } catch (e) {
      if (FileSystem.isNotExistError(e)) {
        return undefined;
      }
      throw e;
    }

    if (!cobuildJson?.cobuildFeatureEnabled) {
      return undefined;
    }

    const cobuildLockProviderFactory: CobuildLockProviderFactory | undefined =
      rushSession.getCobuildLockProviderFactory(cobuildJson.cobuildLockProvider);
    if (!cobuildLockProviderFactory) {
      throw new Error(`Unexpected cobuild lock provider: ${cobuildJson.cobuildLockProvider}`);
    }

    return new CobuildConfiguration({
      cobuildJson,
      rushConfiguration,
      rushSession,
      cobuildLockProviderFactory
    });
  }

  public async createLockProviderAsync(terminal: ITerminal): Promise<void> {
    if (this.cobuildFeatureEnabled) {
      terminal.writeLine(`Running cobuild (runner ${this.cobuildContextId}/${this.cobuildRunnerId})`);
      const cobuildLockProvider: ICobuildLockProvider = await this._cobuildLockProviderFactory(
        this._cobuildJson
      );
      this._cobuildLockProvider = cobuildLockProvider;
      await this._cobuildLockProvider.connectAsync();
    }
  }

  public async destroyLockProviderAsync(): Promise<void> {
    if (this.cobuildFeatureEnabled) {
      await this._cobuildLockProvider?.disconnectAsync();
    }
  }

  public getCobuildLockProvider(): ICobuildLockProvider {
    if (!this._cobuildLockProvider) {
      throw new Error(`Cobuild lock provider has not been created`);
    }
    return this._cobuildLockProvider;
  }
}
