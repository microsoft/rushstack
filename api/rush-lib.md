[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md)

## rush-lib package

A library for writing scripts that interact with the Rush tool.

## Classes

|  <p>Class</p> | <p>Description</p> |
|  --- | --- |
|  <p>[ApprovedPackagesConfiguration](./rush-lib.approvedpackagesconfiguration.md)</p> | <p>This represents the JSON file specified via the "approvedPackagesFile" option in rush.json.</p> |
|  <p>[ApprovedPackagesItem](./rush-lib.approvedpackagesitem.md)</p> | <p>An item returned by ApprovedPackagesConfiguration</p> |
|  <p>[ApprovedPackagesPolicy](./rush-lib.approvedpackagespolicy.md)</p> | <p>This is a helper object for RushConfiguration. It exposes the "approvedPackagesPolicy" feature from rush.json.</p> |
|  <p>[ChangeManager](./rush-lib.changemanager.md)</p> | <p>A class that helps with programatically interacting with Rush's change files.</p> |
|  <p>[CommonVersionsConfiguration](./rush-lib.commonversionsconfiguration.md)</p> | <p>Use this class to load and save the "common/config/rush/common-versions.json" config file. This config file stores dependency version information that affects all projects in the repo.</p> |
|  <p>[EventHooks](./rush-lib.eventhooks.md)</p> | <p><b><i>(BETA)</i></b> This class represents Rush event hooks configured for this repo. Hooks are customized script actions that Rush executes when specific events occur. The actions are expressed as a command-line that is executed using the operating system shell.</p> |
|  <p>[IndividualVersionPolicy](./rush-lib.individualversionpolicy.md)</p> | <p><b><i>(BETA)</i></b> This policy indicates all related projects get version bump driven by their own changes.</p> |
|  <p>[LockStepVersionPolicy](./rush-lib.lockstepversionpolicy.md)</p> | <p><b><i>(BETA)</i></b> This policy indicates all related projects should use the same version.</p> |
|  <p>[PackageJsonDependency](./rush-lib.packagejsondependency.md)</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[PackageJsonEditor](./rush-lib.packagejsoneditor.md)</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[PnpmOptionsConfiguration](./rush-lib.pnpmoptionsconfiguration.md)</p> | <p>Options that are only used when the PNPM package manager is selected.</p> |
|  <p>[Rush](./rush-lib.rush.md)</p> | <p>General operations for the Rush engine.</p> |
|  <p>[RushConfiguration](./rush-lib.rushconfiguration.md)</p> | <p>This represents the Rush configuration for a repository, based on the "rush.json" configuration file.</p> |
|  <p>[RushConfigurationProject](./rush-lib.rushconfigurationproject.md)</p> | <p>This represents the configuration of a project that is built by Rush, based on the Rush.json configuration file.</p> |
|  <p>[VersionPolicy](./rush-lib.versionpolicy.md)</p> | <p><b><i>(BETA)</i></b> This is the base class for version policy which controls how versions get bumped.</p> |
|  <p>[VersionPolicyConfiguration](./rush-lib.versionpolicyconfiguration.md)</p> | <p><b><i>(BETA)</i></b> Use this class to load and save the "common/config/rush/version-policies.json" config file. This config file configures how different groups of projects will be published by Rush, and how their version numbers will be determined.</p> |

## Enumerations

|  <p>Enumeration</p> | <p>Description</p> |
|  --- | --- |
|  <p>[BumpType](./rush-lib.bumptype.md)</p> | <p><b><i>(BETA)</i></b> Type of version bumps</p> |
|  <p>[DependencyType](./rush-lib.dependencytype.md)</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[EnvironmentVariableNames](./rush-lib.environmentvariablenames.md)</p> | <p>Names of environment variables used by Rush.</p> |
|  <p>[Event](./rush-lib.event.md)</p> | <p><b><i>(BETA)</i></b> Events happen during Rush runs.</p> |
|  <p>[VersionPolicyDefinitionName](./rush-lib.versionpolicydefinitionname.md)</p> | <p><b><i>(BETA)</i></b> Version policy base type names</p> |

## Type Aliases

|  <p>Type Alias</p> | <p>Description</p> |
|  --- | --- |
|  <p>[PackageManager](./rush-lib.packagemanager.md)</p> | <p>This represents the available Package Manager tools as a string</p> |

