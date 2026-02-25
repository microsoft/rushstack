// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushAzureStorageBuildCachePlugin } from './RushAzureStorageBuildCachePlugin.ts';
export {
  AzureAuthenticationBase,
  type IAzureAuthenticationBaseOptions,
  type ICredentialResult,
  type AzureEnvironmentName,
  type LoginFlowType,
  type LoginFlowFailoverMap,
  type ITryGetCachedCredentialOptionsBase,
  type ITryGetCachedCredentialOptionsLogWarning,
  type ITryGetCachedCredentialOptionsThrow,
  type ITryGetCachedCredentialOptionsIgnore,
  type ExpiredCredentialBehavior
} from './AzureAuthenticationBase.ts';
export {
  AzureStorageAuthentication,
  type IAzureStorageAuthenticationOptions
} from './AzureStorageAuthentication.ts';

export default RushAzureStorageBuildCachePlugin;
