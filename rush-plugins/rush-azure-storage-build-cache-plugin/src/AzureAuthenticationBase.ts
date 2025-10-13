// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  DeviceCodeCredential,
  type DeviceCodeInfo,
  AzureAuthorityHosts,
  type DeviceCodeCredentialOptions,
  type InteractiveBrowserCredentialInBrowserOptions,
  InteractiveBrowserCredential,
  type InteractiveBrowserCredentialNodeOptions,
  type TokenCredential,
  ChainedTokenCredential,
  VisualStudioCodeCredential,
  AzureCliCredential,
  AzureDeveloperCliCredential,
  AzurePowerShellCredential,
  type TokenCredentialOptions
} from '@azure/identity';

import type { ITerminal } from '@rushstack/terminal';
import { CredentialCache } from '@rushstack/rush-sdk';
// Use a separate import line so the .d.ts file ends up with an `import type { ... }`
// See https://github.com/microsoft/rushstack/issues/3432
import type { ICredentialCacheEntry } from '@rushstack/rush-sdk';
import { PrintUtilities } from '@rushstack/terminal';

import { AdoCodespacesAuthCredential } from './AdoCodespacesAuthCredential';

/**
 * @public
 */
export type ExpiredCredentialBehavior = 'logWarning' | 'throwError' | 'ignore';

/**
 * @public
 */
export interface ITryGetCachedCredentialOptionsBase {
  /**
   * The behavior to take when the cached credential has expired.
   * Defaults to 'throwError'
   */
  expiredCredentialBehavior?: ExpiredCredentialBehavior;
  terminal?: ITerminal;
}

/**
 * @public
 */
export interface ITryGetCachedCredentialOptionsLogWarning extends ITryGetCachedCredentialOptionsBase {
  /**
   * {@inheritdoc ITryGetCachedCredentialOptionsBase.expiredCredentialBehavior}
   */
  expiredCredentialBehavior: 'logWarning';
  terminal: ITerminal;
}

/**
 * @public
 */
export interface ITryGetCachedCredentialOptionsThrow extends ITryGetCachedCredentialOptionsBase {
  /**
   * {@inheritdoc ITryGetCachedCredentialOptionsBase.expiredCredentialBehavior}
   */
  expiredCredentialBehavior: 'throwError';
}

/**
 * @public
 */
export interface ITryGetCachedCredentialOptionsIgnore extends ITryGetCachedCredentialOptionsBase {
  /**
   * {@inheritdoc ITryGetCachedCredentialOptionsBase.expiredCredentialBehavior}
   */
  expiredCredentialBehavior: 'ignore';
}

export type ITryGetCachedCredentialOptions =
  | ITryGetCachedCredentialOptionsLogWarning
  | ITryGetCachedCredentialOptionsThrow
  | ITryGetCachedCredentialOptionsIgnore;

/**
 * @public
 */
export type AzureEnvironmentName = keyof typeof AzureAuthorityHosts;

/**
 * @public
 */
export type LoginFlowType =
  | 'DeviceCode'
  | 'InteractiveBrowser'
  | 'AdoCodespacesAuth'
  | 'VisualStudioCode'
  | 'AzureCli'
  | 'AzureDeveloperCli'
  | 'AzurePowerShell';

/**
 * @public
 */
export type LoginFlowFailoverMap = {
  readonly [LoginFlow in LoginFlowType]?: Exclude<LoginFlowType, LoginFlow>;
};

/**
 * @public
 */
export interface IAzureAuthenticationBaseOptions {
  azureEnvironment?: AzureEnvironmentName;
  credentialUpdateCommandForLogging?: string | undefined;
  loginFlow?: LoginFlowType;
  /**
   * A map to define the failover order for login flows. When a login flow fails to get a credential,
   * the next login flow in the map will be attempted. If the login flow fails and there is no next
   * login flow, the error will be thrown.
   *
   * @defaultValue
   * ```json
   * {
   *   "AdoCodespacesAuth": "VisualStudioCode",
   *   "VisualStudioCode": "AzureCli",
   *   "AzureCli": "AzureDeveloperCli",
   *   "AzureDeveloperCli": "AzurePowerShell",
   *   "AzurePowerShell": "InteractiveBrowser",
   *   "InteractiveBrowser": "DeviceCode",
   *   "DeviceCode": undefined
   * }
   * ```
   */
  loginFlowFailover?: LoginFlowFailoverMap;
}

/**
 * @public
 */ export interface ICredentialResult {
  credentialString: string;
  expiresOn?: Date;
  credentialMetadata?: object;
}

/**
 * @public
 */
export abstract class AzureAuthenticationBase {
  protected abstract readonly _credentialNameForCache: string;
  protected abstract readonly _credentialKindForLogging: string;
  protected readonly _credentialUpdateCommandForLogging: string | undefined;
  protected readonly _additionalDeviceCodeCredentialOptions: DeviceCodeCredentialOptions | undefined;
  protected readonly _additionalInteractiveCredentialOptions:
    | InteractiveBrowserCredentialNodeOptions
    | undefined;

  protected readonly _azureEnvironment: AzureEnvironmentName;
  protected readonly _loginFlow: LoginFlowType;
  protected readonly _failoverOrder:
    | {
        [key in LoginFlowType]?: LoginFlowType;
      }
    | undefined;

  private __credentialCacheId: string | undefined;
  protected get _credentialCacheId(): string {
    if (!this.__credentialCacheId) {
      const cacheIdParts: string[] = [
        this._credentialNameForCache,
        this._azureEnvironment,
        ...this._getCacheIdParts()
      ];

      this.__credentialCacheId = cacheIdParts.join('|');
    }

    return this.__credentialCacheId;
  }

  public constructor(options: IAzureAuthenticationBaseOptions) {
    const {
      azureEnvironment = 'AzurePublicCloud',
      loginFlow = process.env.CODESPACES === 'true' ? 'AdoCodespacesAuth' : 'VisualStudioCode'
    } = options;
    this._azureEnvironment = azureEnvironment;
    this._credentialUpdateCommandForLogging = options.credentialUpdateCommandForLogging;
    this._loginFlow = loginFlow;
    this._failoverOrder = options.loginFlowFailover || {
      AdoCodespacesAuth: 'VisualStudioCode',
      VisualStudioCode: 'AzureCli',
      AzureCli: 'AzureDeveloperCli',
      AzureDeveloperCli: 'AzurePowerShell',
      AzurePowerShell: 'InteractiveBrowser',
      InteractiveBrowser: 'DeviceCode',
      DeviceCode: undefined
    };
  }

  public async updateCachedCredentialAsync(terminal: ITerminal, credential: string): Promise<void> {
    await CredentialCache.usingAsync(
      {
        supportEditing: true
      },
      async (credentialsCache: CredentialCache) => {
        credentialsCache.setCacheEntry(this._credentialCacheId, {
          credential
        });
        await credentialsCache.saveIfModifiedAsync();
      }
    );
  }

  /**
   * Launches an interactive flow to renew a cached credential.
   *
   * @param terminal - The terminal to log output to
   * @param onlyIfExistingCredentialExpiresBefore - If specified, and a cached credential exists, action will only
   * be taken if the cached credential expires before the specified date.
   */
  public async updateCachedCredentialInteractiveAsync(
    terminal: ITerminal,
    onlyIfExistingCredentialExpiresBefore?: Date
  ): Promise<void> {
    await CredentialCache.usingAsync(
      {
        supportEditing: true
      },
      async (credentialsCache: CredentialCache) => {
        if (onlyIfExistingCredentialExpiresBefore) {
          const existingCredentialExpiration: Date | undefined = credentialsCache.tryGetCacheEntry(
            this._credentialCacheId
          )?.expires;
          if (
            existingCredentialExpiration &&
            existingCredentialExpiration > onlyIfExistingCredentialExpiresBefore
          ) {
            return;
          }
        }

        const credential: ICredentialResult = await this._getCredentialAsync(
          terminal,
          this._loginFlow,
          credentialsCache
        );
        credentialsCache.setCacheEntry(this._credentialCacheId, {
          credential: credential.credentialString,
          expires: credential.expiresOn,
          credentialMetadata: credential.credentialMetadata
        });
        await credentialsCache.saveIfModifiedAsync();
      }
    );
  }

  public async deleteCachedCredentialsAsync(terminal: ITerminal): Promise<void> {
    await CredentialCache.usingAsync(
      {
        supportEditing: true
      },
      async (credentialsCache: CredentialCache) => {
        credentialsCache.deleteCacheEntry(this._credentialCacheId);
        await credentialsCache.saveIfModifiedAsync();
      }
    );
  }

  public async tryGetCachedCredentialAsync(
    options?: ITryGetCachedCredentialOptionsThrow | ITryGetCachedCredentialOptionsIgnore
  ): Promise<ICredentialCacheEntry | undefined>;
  public async tryGetCachedCredentialAsync(
    options: ITryGetCachedCredentialOptionsLogWarning
  ): Promise<ICredentialCacheEntry | undefined>;
  public async tryGetCachedCredentialAsync(
    { expiredCredentialBehavior, terminal }: ITryGetCachedCredentialOptions = {
      expiredCredentialBehavior: 'throwError'
    }
  ): Promise<ICredentialCacheEntry | undefined> {
    let cacheEntry: ICredentialCacheEntry | undefined;
    await CredentialCache.usingAsync(
      {
        supportEditing: false
      },
      (credentialsCache: CredentialCache) => {
        cacheEntry = credentialsCache.tryGetCacheEntry(this._credentialCacheId);
      }
    );

    const expirationTime: number | undefined = cacheEntry?.expires?.getTime();
    if (expirationTime && expirationTime < Date.now()) {
      if (expiredCredentialBehavior === 'logWarning' || expiredCredentialBehavior === 'throwError') {
        let errorMessage: string = `Cached Azure ${this._credentialKindForLogging} credentials have expired.`;
        if (this._credentialUpdateCommandForLogging) {
          errorMessage += ` Update the credentials by running "${this._credentialUpdateCommandForLogging}".`;
        }

        if (expiredCredentialBehavior === 'logWarning') {
          terminal.writeWarningLine(errorMessage);
        } else if (expiredCredentialBehavior === 'throwError') {
          throw new Error(errorMessage);
        }
      }

      return undefined;
    } else {
      return cacheEntry;
    }
  }

  /**
   * Get parts of the cache ID that are specific to the credential type. Note that this should
   * not contain the Azure environment or the {@link AzureAuthenticationBase._credentialNameForCache}
   * value, as those are added automatically.
   */
  protected abstract _getCacheIdParts(): string[];

  protected abstract _getCredentialFromTokenAsync(
    terminal: ITerminal,
    tokenCredential: TokenCredential,
    credentialsCache: CredentialCache
  ): Promise<ICredentialResult>;

  private async _getCredentialAsync(
    terminal: ITerminal,
    loginFlow: LoginFlowType,
    credentialsCache: CredentialCache
  ): Promise<ICredentialResult> {
    const authorityHost: string | undefined = AzureAuthorityHosts[this._azureEnvironment];
    if (!authorityHost) {
      throw new Error(`Unexpected Azure environment: ${this._azureEnvironment}`);
    }

    const interactiveCredentialOptions: (
      | InteractiveBrowserCredentialNodeOptions
      | InteractiveBrowserCredentialInBrowserOptions
    ) &
      DeviceCodeCredentialOptions = {
      ...this._additionalInteractiveCredentialOptions,
      authorityHost
    };

    const deviceCodeCredentialOptions: DeviceCodeCredentialOptions = {
      ...this._additionalDeviceCodeCredentialOptions,
      ...interactiveCredentialOptions,
      userPromptCallback: (deviceCodeInfo: DeviceCodeInfo) => {
        PrintUtilities.printMessageInBox(deviceCodeInfo.message, terminal);
      }
    };

    const options: TokenCredentialOptions = { authorityHost };
    const priority: Set<LoginFlowType> = new Set([loginFlow]);
    for (const credType of priority) {
      const next: LoginFlowType | undefined = this._failoverOrder?.[credType];
      if (next) {
        priority.add(next);
      }
    }

    const knownCredentialTypes: Record<
      LoginFlowType,
      new (options: TokenCredentialOptions) => TokenCredential
    > = {
      DeviceCode: class extends DeviceCodeCredential {
        public new(credentialOptions: DeviceCodeCredentialOptions): DeviceCodeCredential {
          return new DeviceCodeCredential({
            ...deviceCodeCredentialOptions,
            ...credentialOptions
          });
        }
      },
      InteractiveBrowser: class extends InteractiveBrowserCredential {
        public new(credentialOptions: InteractiveBrowserCredentialNodeOptions): InteractiveBrowserCredential {
          return new InteractiveBrowserCredential({ ...interactiveCredentialOptions, ...credentialOptions });
        }
      },
      AdoCodespacesAuth: AdoCodespacesAuthCredential,
      VisualStudioCode: VisualStudioCodeCredential,
      AzureCli: AzureCliCredential,
      AzureDeveloperCli: AzureDeveloperCliCredential,
      AzurePowerShell: AzurePowerShellCredential
    };

    const credentials: TokenCredential[] = Array.from(
      priority,
      (credType) => new knownCredentialTypes[credType](options)
    );

    const tokenCredential: TokenCredential = new ChainedTokenCredential(...credentials);

    try {
      return await this._getCredentialFromTokenAsync(terminal, tokenCredential, credentialsCache);
    } catch (error) {
      terminal.writeVerbose(`Failed to get credentials with ${loginFlow}: ${error}`);
      throw error;
    }
  }
}
