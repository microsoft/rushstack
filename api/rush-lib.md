[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md)

# rush-lib package

A library for writing scripts that interact with the Rush tool.

## Classes

|  Class | Description |
|  --- | --- |
|  [`ApprovedPackagesConfiguration`](./rush-lib.approvedpackagesconfiguration.md) | This represents the JSON file specified via the "approvedPackagesFile" option in rush.json. |
|  [`ApprovedPackagesItem`](./rush-lib.approvedpackagesitem.md) | An item returned by ApprovedPackagesConfiguration |
|  [`ApprovedPackagesPolicy`](./rush-lib.approvedpackagespolicy.md) | This is a helper object for RushConfiguration. It exposes the "approvedPackagesPolicy" feature from rush.json. |
|  [`ChangeFile`](./rush-lib.changefile.md) | This class represents a single change file. |
|  [`CommonVersionsConfiguration`](./rush-lib.commonversionsconfiguration.md) | Use this class to load and save the "common/config/rush/common-versions.json" config file. This config file stores dependency version information that affects all projects in the repo. |
|  [`EventHooks`](./rush-lib.eventhooks.md) | **_(BETA)_** This class represents Rush event hooks configured for this repo. Hooks are customized script actions that Rush executes when specific events occur. The actions are expressed as a command-line that is executed using the operating system shell. |
|  [`IndividualVersionPolicy`](./rush-lib.individualversionpolicy.md) | **_(BETA)_** This policy indicates all related projects get version bump driven by their own changes. |
|  [`LockStepVersionPolicy`](./rush-lib.lockstepversionpolicy.md) | **_(BETA)_** This policy indicates all related projects should use the same version. |
|  [`Rush`](./rush-lib.rush.md) | General operations for the Rush engine. |
|  [`RushConfiguration`](./rush-lib.rushconfiguration.md) | This represents the Rush configuration for a repository, based on the "rush.json" configuration file. |
|  [`RushConfigurationProject`](./rush-lib.rushconfigurationproject.md) | This represents the configuration of a project that is built by Rush, based on the Rush.json configuration file. |
|  [`VersionPolicy`](./rush-lib.versionpolicy.md) | **_(BETA)_** This is the base class for version policy which controls how versions get bumped. |
|  [`VersionPolicyConfiguration`](./rush-lib.versionpolicyconfiguration.md) | **_(BETA)_** Use this class to load and save the "common/config/rush/version-policies.json" config file. This config file configures how different groups of projects will be published by Rush, and how their version numbers will be determined. |

## Interfaces

|  Interface | Description |
|  --- | --- |
|  [`IChangeInfo`](./rush-lib.ichangeinfo.md) | Defines an IChangeInfo object. |

## Enumerations

|  Enumeration | Description |
|  --- | --- |
|  [`BumpType`](./rush-lib.bumptype.md) | **_(BETA)_** Type of version bumps |
|  [`ChangeType`](./rush-lib.changetype.md) | Represents all of the types of change requests. |
|  [`EnvironmentVariableNames`](./rush-lib.environmentvariablenames.md) | Names of environment variables used by Rush. |
|  [`Event`](./rush-lib.event.md) | **_(BETA)_** Events happen during Rush runs. |
|  [`VersionPolicyDefinitionName`](./rush-lib.versionpolicydefinitionname.md) | **_(BETA)_** Version policy base type names |

