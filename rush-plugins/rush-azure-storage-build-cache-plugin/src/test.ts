import { DeviceCodeCredential } from '@azure/identity';
import { ITerminal } from '@rushstack/node-core-library';
import { IAzureAuthenticationConfiguration } from './RushAzureInteractiveAuthPlugin';
import { KeyVaultAuthentication } from './KeyVaultAuthentication';

async function additionalCredentialFetchers(
  deviceCodeCredential: DeviceCodeCredential,
  terminal: ITerminal,
  options: IAzureAuthenticationConfiguration,
  minimumExpiry: Date | undefined
): Promise<void> {
  const { keyVaultName = '', keyVaultSecretName = '' } = options;

  await new KeyVaultAuthentication({
    vaultName: keyVaultName,
    secretName: keyVaultSecretName,
    deviceCodeCredentails: deviceCodeCredential
  }).updateCachedCredentialInteractiveAsync(terminal, minimumExpiry);
}

export { additionalCredentialFetchers };
