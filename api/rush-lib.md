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
|  [`EventHooks`](./rush-lib.eventhooks.md) | **_(BETA)_** This class represents Rush event hooks configured for this repo. Hooks are customized script actions that Rush executes when specific events occur. The actions are expressed as a command-line that is executed using the operating system shell. |
|  [`IndividualVersionPolicy`](./rush-lib.individualversionpolicy.md) | **_(BETA)_** This policy indicates all related projects get version bump driven by their own changes. |
|  [`LockStepVersionPolicy`](./rush-lib.lockstepversionpolicy.md) | **_(BETA)_** This policy indicates all related projects should use the same version. |
|  [`PinnedVersionsConfiguration`](./rush-lib.pinnedversionsconfiguration.md) | Pinned Versions is a Rush feature designed to mimic the behavior of npm when performing an install. Essentially, for a project, NPM installs all of the first level dependencies before starting any second-level dependencies. This means that you can control the specific version of a second-level dependency by promoting it to a 1st level dependency and using a version number that would satisfy. However, since rush uses the /common/package.json file, NPM treats each rush project as a top-level dependency, and treats the actual 1st level dependencies as second order. This means you could have cases where there is unnecessary inversion and side-by-side versioning in your shrinkwrap file. To mitigate this issue, we promote some dependencies and list them directly in the /common/package.json, ensuring that the selected version will be installed first and at the root. |
|  [`Rush`](./rush-lib.rush.md) | Operations involving the rush tool and its operation. |
|  [`RushConfiguration`](./rush-lib.rushconfiguration.md) | This represents the Rush configuration for a repository, based on the Rush.json configuration file. |
|  [`RushConfigurationProject`](./rush-lib.rushconfigurationproject.md) | This represents the configuration of a project that is built by Rush, based on the Rush.json configuration file. |
|  [`VersionPolicy`](./rush-lib.versionpolicy.md) | **_(BETA)_** This is the base class for version policy which controls how versions get bumped. |
|  [`VersionPolicyConfiguration`](./rush-lib.versionpolicyconfiguration.md) | **_(BETA)_**  |

## Interfaces

|  Interface | Description |
|  --- | --- |
|  [`IChangeInfo`](./rush-lib.ichangeinfo.md) | Defines an IChangeInfo object. |
|  [`IPackageJson`](./rush-lib.ipackagejson.md) | Represents an NPM "package.json" file. |

## Enumerations

|  Enumeration | Description |
|  --- | --- |
|  [`BumpType`](./rush-lib.bumptype.md) | **_(BETA)_** Type of version bumps |
|  [`ChangeType`](./rush-lib.changetype.md) | Represents all of the types of change requests. |
|  [`Event`](./rush-lib.event.md) | **_(BETA)_** Events happen during Rush runs. |
|  [`VersionPolicyDefinitionName`](./rush-lib.versionpolicydefinitionname.md) | **_(BETA)_** Version policy base type names |

