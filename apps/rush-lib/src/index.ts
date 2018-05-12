// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A library for writing scripts that interact with the Rush tool.
 * @packagedocumentation
 */

export {
  ApprovedPackagesPolicy
} from './data/ApprovedPackagesPolicy';

export {
  RushConfiguration,
  PackageManager
} from './data/RushConfiguration';

export {
  EnvironmentVariableNames
} from './data/EnvironmentConfiguration';

export {
  RushConfigurationProject
} from './data/RushConfigurationProject';

export {
  ApprovedPackagesItem,
  ApprovedPackagesConfiguration
} from './data/ApprovedPackagesConfiguration';

export {
  CommonVersionsConfiguration
} from './data/CommonVersionsConfiguration';

export {
  EventHooks,
  Event
} from './data/EventHooks';

export {
  ChangeFile
} from './data/ChangeFile';

export {
  ChangeType,
  IChangeInfo
} from './data/ChangeManagement';

export {
  LastInstallFlag as _LastInstallFlag
} from './utilities/LastInstallFlag';

export {
  VersionPolicyDefinitionName,
  BumpType,
  LockStepVersionPolicy,
  IndividualVersionPolicy,
  VersionPolicy
} from './data/VersionPolicy';

export {
  VersionPolicyConfiguration
} from './data/VersionPolicyConfiguration';

/**
 * @internal
 */
export { Rush } from './Rush';
