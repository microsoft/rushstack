[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md)

## rush-lib package

A library for writing scripts that interact with the Rush tool.

## Classes

|  Class | Description |
|  --- | --- |
|  [ApprovedPackagesConfiguration](./rush-lib.approvedpackagesconfiguration.md) | This represents the JSON file specified via the "approvedPackagesFile" option in rush.json. |
|  [ApprovedPackagesItem](./rush-lib.approvedpackagesitem.md) | An item returned by ApprovedPackagesConfiguration |
|  [ApprovedPackagesPolicy](./rush-lib.approvedpackagespolicy.md) | This is a helper object for RushConfiguration. It exposes the "approvedPackagesPolicy" feature from rush.json. |
|  [ChangeManager](./rush-lib.changemanager.md) | A class that helps with programatically interacting with Rush's change files. |
|  [CommonVersionsConfiguration](./rush-lib.commonversionsconfiguration.md) | Use this class to load and save the "common/config/rush/common-versions.json" config file. This config file stores dependency version information that affects all projects in the repo. |
|  [EventHooks](./rush-lib.eventhooks.md) | <b><i>(BETA)</i></b> This class represents Rush event hooks configured for this repo. Hooks are customized script actions that Rush executes when specific events occur. The actions are expressed as a command-line that is executed using the operating system shell. |
|  [IndividualVersionPolicy](./rush-lib.individualversionpolicy.md) | <b><i>(BETA)</i></b> This policy indicates all related projects get version bump driven by their own changes. |
|  [LockStepVersionPolicy](./rush-lib.lockstepversionpolicy.md) | <b><i>(BETA)</i></b> This policy indicates all related projects should use the same version. |
|  [PackageJsonDependency](./rush-lib.packagejsondependency.md) | <b><i>(BETA)</i></b> |
|  [PackageJsonEditor](./rush-lib.packagejsoneditor.md) | <b><i>(BETA)</i></b> |
|  [PnpmOptionsConfiguration](./rush-lib.pnpmoptionsconfiguration.md) | Options that are only used when the PNPM package manager is selected. |
|  [Rush](./rush-lib.rush.md) | General operations for the Rush engine. |
|  [RushConfiguration](./rush-lib.rushconfiguration.md) | This represents the Rush configuration for a repository, based on the "rush.json" configuration file. |
|  [RushConfigurationProject](./rush-lib.rushconfigurationproject.md) | This represents the configuration of a project that is built by Rush, based on the Rush.json configuration file. |
|  [VersionPolicy](./rush-lib.versionpolicy.md) | <b><i>(BETA)</i></b> This is the base class for version policy which controls how versions get bumped. |
|  [VersionPolicyConfiguration](./rush-lib.versionpolicyconfiguration.md) | <b><i>(BETA)</i></b> Use this class to load and save the "common/config/rush/version-policies.json" config file. This config file configures how different groups of projects will be published by Rush, and how their version numbers will be determined. |

## Enumerations

|  Enumeration | Description |
|  --- | --- |
|  [BumpType](./rush-lib.bumptype.md) | <b><i>(BETA)</i></b> Type of version bumps |
|  [DependencyType](./rush-lib.dependencytype.md) | <b><i>(BETA)</i></b> |
|  [EnvironmentVariableNames](./rush-lib.environmentvariablenames.md) | Names of environment variables used by Rush. |
|  [Event](./rush-lib.event.md) | <b><i>(BETA)</i></b> Events happen during Rush runs. |
|  [VersionPolicyDefinitionName](./rush-lib.versionpolicydefinitionname.md) | <b><i>(BETA)</i></b> Version policy base type names |

## Type Aliases

|  Type Alias | Description |
|  --- | --- |
|  [PackageManager](./rush-lib.packagemanager.md) | This represents the available Package Manager tools as a string |

