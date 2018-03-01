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
  default as RushConfiguration,
  PackageManager
} from './data/RushConfiguration';

export {
  default as RushConfigurationProject
} from './data/RushConfigurationProject';

export {
  ApprovedPackagesItem,
  ApprovedPackagesConfiguration
} from './data/ApprovedPackagesConfiguration';

export {
  PinnedVersionsConfiguration
} from './data/PinnedVersionsConfiguration';

export {
  default as EventHooks,
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
  default as IPackageJson
} from './utilities/IPackageJson';

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
export { default as Rush } from './Rush';
