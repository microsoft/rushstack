[Home](./index) &gt; [@microsoft/rush-lib](rush-lib.md) &gt; [RushConfiguration](rush-lib.rushconfiguration.md)

# RushConfiguration class

This represents the Rush configuration for a repository, based on the Rush.json configuration file.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`approvedPackagesPolicy`](rush-lib.rushconfiguration.approvedpackagespolicy.md) |  | `ApprovedPackagesPolicy` | The "approvedPackagesPolicy" settings. |
|  [`changesFolder`](rush-lib.rushconfiguration.changesfolder.md) |  | `string` | The folder that contains all change files. |
|  [`committedShrinkwrapFilename`](rush-lib.rushconfiguration.committedshrinkwrapfilename.md) |  | `string` | The filename of the NPM shrinkwrap file that is tracked e.g. by Git. (The "rush install" command uses a temporary copy, whose path is tempShrinkwrapFilename.) This property merely reports the filename; the file itself may not actually exist. Example: "C:\\MyRepo\\common\\npm-shrinkwrap.json" |
|  [`commonFolder`](rush-lib.rushconfiguration.commonfolder.md) |  | `string` | The fully resolved path for the "common" folder where Rush will store settings that affect all Rush projects. This is always a subfolder of the folder containing "rush.json". Example: "C:\\MyRepo\\common" |
|  [`commonRushConfigFolder`](rush-lib.rushconfiguration.commonrushconfigfolder.md) |  | `string` | The folder where Rush's additional config files are stored. This folder is always a subfolder called "config\\rush" inside the common folder. (The "common\\config" folder is reserved for configuration files used by other tools.) To avoid confusion or mistakes, Rush will report an error if this this folder contains any unrecognized files.<p/><!-- -->Example: "C:\\MyRepo\\common\\config\\rush" |
|  [`commonTempFolder`](rush-lib.rushconfiguration.commontempfolder.md) |  | `string` | The folder where temporary files will be stored. This is always a subfolder called "temp" inside the common folder. Example: "C:\\MyRepo\\common\\temp" |
|  [`eventHooks`](rush-lib.rushconfiguration.eventhooks.md) |  | `EventHooks` | The rush hooks. It allows cusomized scripts to run at the specified point. |
|  [`gitAllowedEmailRegExps`](rush-lib.rushconfiguration.gitallowedemailregexps.md) |  | `string[]` | \[Part of the "gitPolicy" feature.\] A list of regular expressions describing allowable e-mail patterns for Git commits. They are case-insensitive anchored JavaScript RegExps. Example: ".\*@example\\.com" This array will never be undefined. |
|  [`gitSampleEmail`](rush-lib.rushconfiguration.gitsampleemail.md) |  | `string` | \[Part of the "gitPolicy" feature.\] An example valid e-mail address that conforms to one of the allowedEmailRegExps. Example: "foxtrot@example\\.com" This will never be undefined, and will always be nonempty if gitAllowedEmailRegExps is used. |
|  [`homeFolder`](rush-lib.rushconfiguration.homefolder.md) |  | `string` | The absolute path to the home directory for the current user. On Windows, it would be something like "C:\\Users\\YourName". |
|  [`npmCacheFolder`](rush-lib.rushconfiguration.npmcachefolder.md) |  | `string` | The local folder that will store the NPM package cache. Rush does not rely on the NPM's default global cache folder, because NPM's caching implementation does not reliably handle multiple processes. (For example, if a build box is running "rush install" simultaneously for two different working folders, it may fail randomly.)<p/><!-- -->Example: "C:\\MyRepo\\common\\temp\\npm-cache" |
|  [`npmTmpFolder`](rush-lib.rushconfiguration.npmtmpfolder.md) |  | `string` | The local folder where NPM's temporary files will be written during installation. Rush does not rely on the global default folder, because it may be on a different hard disk.<p/><!-- -->Example: "C:\\MyRepo\\common\\temp\\npm-tmp" |
|  [`npmToolFilename`](rush-lib.rushconfiguration.npmtoolfilename.md) |  | `string` | The absolute path to the locally installed NPM tool. If "rush install" has not been run, then this file may not exist yet. Example: "C:\\MyRepo\\common\\temp\\npm-local\\node\_modules\\.bin\\npm" |
|  [`npmToolVersion`](rush-lib.rushconfiguration.npmtoolversion.md) |  | `string` | The version of the locally installed NPM tool. (Example: "1.2.3") |
|  [`pinnedVersions`](rush-lib.rushconfiguration.pinnedversions.md) |  | `PinnedVersionsConfiguration` | The PinnedVersionsConfiguration object. If the pinnedVersions.json file is missing, this property will NOT be undefined. Instead it will be initialized in an empty state, and calling PinnedVersionsConfiguration.save() will create the file. |
|  [`projectFolderMaxDepth`](rush-lib.rushconfiguration.projectfoldermaxdepth.md) |  | `number` | The maximum allowable folder depth for the projectFolder field in the rush.json file. This setting provides a way for repository maintainers to discourage nesting of project folders that makes the directory tree more difficult to navigate. The default value is 2, which implements on a standard convention of &lt;categoryFolder&gt;/&lt;projectFolder&gt;/package.json. |
|  [`projectFolderMinDepth`](rush-lib.rushconfiguration.projectfoldermindepth.md) |  | `number` | The minimum allowable folder depth for the projectFolder field in the rush.json file. This setting provides a way for repository maintainers to discourage nesting of project folders that makes the directory tree more difficult to navigate. The default value is 2, which implements a standard 2-level hierarchy of &lt;categoryFolder&gt;/&lt;projectFolder&gt;/package.json. |
|  [`projects`](rush-lib.rushconfiguration.projects.md) |  | `RushConfigurationProject[]` |  |
|  [`projectsByName`](rush-lib.rushconfiguration.projectsbyname.md) |  | `Map<string, RushConfigurationProject>` |  |
|  [`repositoryUrl`](rush-lib.rushconfiguration.repositoryurl.md) |  | `string` | The remote url of the repository. It helps 'Rush change' finds the right remote to compare against. |
|  [`rushJsonFile`](rush-lib.rushconfiguration.rushjsonfile.md) |  | `string` | The Rush configuration file |
|  [`rushJsonFolder`](rush-lib.rushconfiguration.rushjsonfolder.md) |  | `string` | The folder that contains rush.json for this project. |
|  [`rushLinkJsonFilename`](rush-lib.rushconfiguration.rushlinkjsonfilename.md) |  | `string` | The filename of the build dependency data file. By default this is called 'rush-link.json' resides in the Rush common folder. Its data structure is defined by IRushLinkJson.<p/><!-- -->Example: "C:\\MyRepo\\common\\temp\\rush-link.json" |
|  [`telemetryEnabled`](rush-lib.rushconfiguration.telemetryenabled.md) |  | `boolean` | Indicates whether telemetry collection is enabled for Rush runs. |
|  [`tempShrinkwrapFilename`](rush-lib.rushconfiguration.tempshrinkwrapfilename.md) |  | `string` | The filename of the temporary NPM shrinkwrap file that is used by "rush install". (The master copy is tempShrinkwrapFilename.) This property merely reports the filename; the file itself may not actually exist. Example: "C:\\MyRepo\\common\\temp\\npm-shrinkwrap.json" |
|  [`versionPolicyConfiguration`](rush-lib.rushconfiguration.versionpolicyconfiguration.md) |  | `VersionPolicyConfiguration` |  |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`findProjectByShorthandName(shorthandProjectName)`](rush-lib.rushconfiguration.findprojectbyshorthandname.md) | `public` | `RushConfigurationProject | undefined` | This is used e.g. by command-line interfaces such as "rush build --to example". If "example" is not a project name, then it also looks for a scoped name like "@something/example". If exactly one project matches this heuristic, it is returned. Otherwise, undefined is returned. |
|  [`findProjectByTempName(tempProjectName)`](rush-lib.rushconfiguration.findprojectbytempname.md) | `public` | `RushConfigurationProject | undefined` | Looks up a project by its RushConfigurationProject.tempProjectName field. |
|  [`getHomeDirectory()`](rush-lib.rushconfiguration.gethomedirectory.md) | `public` | `string` | Get the user's home directory. On windows this looks something like "C:\\users\\username\\" and on UNIX this looks something like "/usr/username/" |
|  [`getProjectByName(projectName)`](rush-lib.rushconfiguration.getprojectbyname.md) | `public` | `RushConfigurationProject | undefined` | Looks up a project in the projectsByName map. If the project is not found, then undefined is returned. |
|  [`loadFromConfigurationFile(rushJsonFilename)`](rush-lib.rushconfiguration.loadfromconfigurationfile.md) | `public` | `RushConfiguration` | Loads the configuration data from an Rush.json configuration file and returns an RushConfiguration object. |
|  [`loadFromDefaultLocation()`](rush-lib.rushconfiguration.loadfromdefaultlocation.md) | `public` | `RushConfiguration` |  |
|  [`tryFindRushJsonLocation(verbose)`](rush-lib.rushconfiguration.tryfindrushjsonlocation.md) | `public` | `string | undefined` | Find the rush.json location and return the path, or undefined if a rush.json can't be found. |

