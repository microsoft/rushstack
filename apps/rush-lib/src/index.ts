// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A library for writing scripts that interact with the Rush tool.
 * @packageDocumentation
 */

export {
  ApprovedPackagesPolicy
} from './api/ApprovedPackagesPolicy';

export {
  RushConfiguration,
  ITryFindRushJsonLocationOptions,
  PackageManager,
  ResolutionStrategy,
  PnpmOptionsConfiguration,
  YarnOptionsConfiguration
} from './api/RushConfiguration';

export {
  EnvironmentVariableNames
} from './api/EnvironmentConfiguration';

export {
  RushConfigurationProject
} from './api/RushConfigurationProject';

export {
  RushGlobalFolder as _RushGlobalFolder
} from './api/RushGlobalFolder';

export {
  ApprovedPackagesItem,
  ApprovedPackagesConfiguration
} from './api/ApprovedPackagesConfiguration';

export {
  CommonVersionsConfiguration
} from './api/CommonVersionsConfiguration';

export {
  PackageJsonEditor,
  PackageJsonDependency,
  DependencyType
} from './api/PackageJsonEditor';

export {
  EventHooks,
  Event
} from './api/EventHooks';

export {
  ChangeManager
} from './api/ChangeManager';

export {
  LastInstallFlag as _LastInstallFlag
} from './api/LastInstallFlag';

export {
  VersionPolicyDefinitionName,
  BumpType,
  LockStepVersionPolicy,
  IndividualVersionPolicy,
  VersionPolicy
} from './api/VersionPolicy';

export {
  VersionPolicyConfiguration
} from './api/VersionPolicyConfiguration';

export { Rush } from './api/Rush';
