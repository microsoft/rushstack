import type { DeviceCodeCredential } from '@azure/identity';
import { type KeyVaultSecret, SecretClient } from '@azure/keyvault-secrets';
import type { ITerminal } from '@rushstack/node-core-library';
import type { ICredentialResult, IAzureAuthenticationBaseOptions } from './AzureAuthenticationBase';
// Importing this from the index triggers a runtime import of `@rushstack/rush-sdk`.
import { AzureAuthenticationBase } from './AzureAuthenticationBase';
import type { ICredentialCacheEntry } from '@rushstack/rush-sdk';

/**
 * @public
 */
export interface IKeyVaultAuthenticationOptions extends IAzureAuthenticationBaseOptions {
  updateCredentialCommand?: string;
  vaultName: string;
  secretName: string;
  /**
   * If this value is sooner than the expiration from KeyVault, use this time instead.
   *
   * @remarks
   * If the expiration from KeyVault is sooner, that time is used instead.
   */
  overrideExpiration?: Date;
}

interface IKeyVaultCredentialMetadata {
  credentialVersion: string | undefined;
}

/**
 * @public
 */
export class KeyVaultAuthentication extends AzureAuthenticationBase {
  protected readonly _credentialNameForCache: string = 'azure-key-vault';
  protected readonly _credentialKindForLogging: string = 'Key Vault';
  protected readonly _credentialUpdateCommandForLogging: string | undefined;
  private readonly _vaultName: string;
  private readonly _secretName: string;
  private readonly _overrideExpiration: Date | undefined;

  public constructor(options: IKeyVaultAuthenticationOptions) {
    super(options);
    this._credentialUpdateCommandForLogging = options.updateCredentialCommand;
    this._vaultName = options.vaultName;
    this._secretName = options.secretName;
  }

  public static isCredentialVersionInList(
    credential: ICredentialCacheEntry,
    versionSet: Set<string | undefined>
  ): boolean {
    const credentialMetadata: IKeyVaultCredentialMetadata | undefined = credential.credentialMetadata as
      | IKeyVaultCredentialMetadata
      | undefined;
    const credentialVersion: string | undefined = credentialMetadata?.credentialVersion;
    return versionSet.has(credentialVersion);
  }

  protected _getCacheIdParts(): string[] {
    return [this._vaultName, this._secretName];
  }

  protected async _getCredentialFromDeviceCodeAsync(
    terminal: ITerminal,
    deviceCodeCredential: DeviceCodeCredential
  ): Promise<ICredentialResult> {
    const keyVaultUrl: string = `https://${this._vaultName}.vault.azure.net`;
    const secretClient: SecretClient = new SecretClient(keyVaultUrl, deviceCodeCredential);
    const secret: KeyVaultSecret = await secretClient.getSecret(this._secretName);
    if (secret.value === undefined) {
      throw new Error('Unable to get secret value');
    }

    let expiresOn: Date | undefined = secret.properties.expiresOn;
    if (!expiresOn) {
      expiresOn = this._overrideExpiration;
    } else {
      if (this._overrideExpiration && expiresOn > this._overrideExpiration) {
        expiresOn = this._overrideExpiration;
      }
    }

    const credentialMetadata: IKeyVaultCredentialMetadata = {
      credentialVersion: secret.properties.version
    };

    return {
      credentialString: secret.value,
      expiresOn,
      credentialMetadata
    };
  }
}
