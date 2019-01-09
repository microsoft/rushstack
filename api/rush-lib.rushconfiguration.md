[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [RushConfiguration](./rush-lib.rushconfiguration.md)

## RushConfiguration class

This represents the Rush configuration for a repository, based on the "rush.json" configuration file.

<b>Signature:</b>

```typescript
export declare class RushConfiguration 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[approvedPackagesPolicy](./rush-lib.rushconfiguration.approvedpackagespolicy.md)</p> |  | <p>`ApprovedPackagesPolicy`</p> | <p>The "approvedPackagesPolicy" settings.</p> |
|  <p>[changesFolder](./rush-lib.rushconfiguration.changesfolder.md)</p> |  | <p>`string`</p> | <p>The folder that contains all change files.</p> |
|  <p>[committedShrinkwrapFilename](./rush-lib.rushconfiguration.committedshrinkwrapfilename.md)</p> |  | <p>`string`</p> | <p>The full path of the shrinkwrap file that is tracked by Git. (The "rush install" command uses a temporary copy, whose path is tempShrinkwrapFilename.)</p> |
|  <p>[commonFolder](./rush-lib.rushconfiguration.commonfolder.md)</p> |  | <p>`string`</p> | <p>The fully resolved path for the "common" folder where Rush will store settings that affect all Rush projects. This is always a subfolder of the folder containing "rush.json". Example: `C:\MyRepo\common`</p> |
|  <p>[commonRushConfigFolder](./rush-lib.rushconfiguration.commonrushconfigfolder.md)</p> |  | <p>`string`</p> | <p>The folder where Rush's additional config files are stored. This folder is always a subfolder called `config\rush` inside the common folder. (The `common\config` folder is reserved for configuration files used by other tools.) To avoid confusion or mistakes, Rush will report an error if this this folder contains any unrecognized files.</p><p>Example: `C:\MyRepo\common\config\rush`</p> |
|  <p>[commonScriptsFolder](./rush-lib.rushconfiguration.commonscriptsfolder.md)</p> |  | <p>`string`</p> | <p>The folder where automation scripts are stored. This is always a subfolder called "scripts" under the common folder. Example: `C:\MyRepo\common\scripts`</p> |
|  <p>[commonTempFolder](./rush-lib.rushconfiguration.commontempfolder.md)</p> |  | <p>`string`</p> | <p>The folder where temporary files will be stored. This is always a subfolder called "temp" under the common folder. Example: `C:\MyRepo\common\temp`</p> |
|  <p>[commonVersions](./rush-lib.rushconfiguration.commonversions.md)</p> |  | <p>`CommonVersionsConfiguration`</p> | <p>Settings from the common-versions.json config file.</p> |
|  <p>[currentInstalledVariant](./rush-lib.rushconfiguration.currentinstalledvariant.md)</p> |  | <p>`string | undefined`</p> | <p>Gets the currently-installed variant, if an installation has occurred. For Rush operations which do not take a --variant parameter, this method determines which variant, if any, was last specified when performing "rush install" or "rush update".</p> |
|  <p>[currentVariantJsonFilename](./rush-lib.rushconfiguration.currentvariantjsonfilename.md)</p> |  | <p>`string`</p> | <p>The filename of the variant dependency data file. By default this is called 'current-variant.json' resides in the Rush common folder. Its data structure is defined by ICurrentVariantJson.</p><p>Example: `C:\MyRepo\common\temp\current-variant.json`</p> |
|  <p>[ensureConsistentVersions](./rush-lib.rushconfiguration.ensureconsistentversions.md)</p> |  | <p>`boolean`</p> | <p>If true, then consistent version specifiers for dependencies will be enforced. I.e. "rush check" is run before some commands.</p> |
|  <p>[eventHooks](./rush-lib.rushconfiguration.eventhooks.md)</p> |  | <p>`EventHooks`</p> | <p><b><i>(BETA)</i></b> The rush hooks. It allows customized scripts to run at the specified point.</p> |
|  <p>[gitAllowedEmailRegExps](./rush-lib.rushconfiguration.gitallowedemailregexps.md)</p> |  | <p>`string[]`</p> | <p>\[Part of the "gitPolicy" feature.\] A list of regular expressions describing allowable email patterns for Git commits. They are case-insensitive anchored JavaScript RegExps. Example: `".*@example\.com"` This array will never be undefined.</p> |
|  <p>[gitSampleEmail](./rush-lib.rushconfiguration.gitsampleemail.md)</p> |  | <p>`string`</p> | <p>\[Part of the "gitPolicy" feature.\] An example valid email address that conforms to one of the allowedEmailRegExps. Example: `"foxtrot@example\.com"` This will never be undefined, and will always be nonempty if gitAllowedEmailRegExps is used.</p> |
|  <p>[hotfixChangeEnabled](./rush-lib.rushconfiguration.hotfixchangeenabled.md)</p> |  | <p>`boolean`</p> | <p>\[Part of the "hotfixChange" feature.\] Enables creating hotfix changes</p> |
|  <p>[npmCacheFolder](./rush-lib.rushconfiguration.npmcachefolder.md)</p> |  | <p>`string`</p> | <p>The local folder that will store the NPM package cache. Rush does not rely on the npm's default global cache folder, because npm's caching implementation does not reliably handle multiple processes. (For example, if a build box is running "rush install" simultaneously for two different working folders, it may fail randomly.)</p><p>Example: `C:\MyRepo\common\temp\npm-cache`</p> |
|  <p>[npmTmpFolder](./rush-lib.rushconfiguration.npmtmpfolder.md)</p> |  | <p>`string`</p> | <p>The local folder where npm's temporary files will be written during installation. Rush does not rely on the global default folder, because it may be on a different hard disk.</p><p>Example: `C:\MyRepo\common\temp\npm-tmp`</p> |
|  <p>[packageManager](./rush-lib.rushconfiguration.packagemanager.md)</p> |  | <p>`PackageManager`</p> | <p>The name of the package manager being used to install dependencies</p> |
|  <p>[packageManagerToolFilename](./rush-lib.rushconfiguration.packagemanagertoolfilename.md)</p> |  | <p>`string`</p> | <p>The absolute path to the locally installed NPM tool. If "rush install" has not been run, then this file may not exist yet. Example: `C:\MyRepo\common\temp\npm-local\node_modules\.bin\npm`</p> |
|  <p>[packageManagerToolVersion](./rush-lib.rushconfiguration.packagemanagertoolversion.md)</p> |  | <p>`string`</p> | <p>The version of the locally installed NPM tool. (Example: "1.2.3")</p> |
|  <p>[pnpmOptions](./rush-lib.rushconfiguration.pnpmoptions.md)</p> |  | <p>`PnpmOptionsConfiguration`</p> | <p></p> |
|  <p>[pnpmStoreFolder](./rush-lib.rushconfiguration.pnpmstorefolder.md)</p> |  | <p>`string`</p> | <p>The local folder where PNPM stores a global installation for every installed package</p><p>Example: `C:\MyRepo\common\temp\pnpm-store`</p> |
|  <p>[projectFolderMaxDepth](./rush-lib.rushconfiguration.projectfoldermaxdepth.md)</p> |  | <p>`number`</p> | <p>The maximum allowable folder depth for the projectFolder field in the rush.json file. This setting provides a way for repository maintainers to discourage nesting of project folders that makes the directory tree more difficult to navigate. The default value is 2, which implements on a standard convention of <categoryFolder>/<projectFolder>/package.json.</p> |
|  <p>[projectFolderMinDepth](./rush-lib.rushconfiguration.projectfoldermindepth.md)</p> |  | <p>`number`</p> | <p>The minimum allowable folder depth for the projectFolder field in the rush.json file. This setting provides a way for repository maintainers to discourage nesting of project folders that makes the directory tree more difficult to navigate. The default value is 2, which implements a standard 2-level hierarchy of <categoryFolder>/<projectFolder>/package.json.</p> |
|  <p>[projects](./rush-lib.rushconfiguration.projects.md)</p> |  | <p>`RushConfigurationProject[]`</p> |  |
|  <p>[projectsByName](./rush-lib.rushconfiguration.projectsbyname.md)</p> |  | <p>`Map<string, RushConfigurationProject>`</p> |  |
|  <p>[repositoryUrl](./rush-lib.rushconfiguration.repositoryurl.md)</p> |  | <p>`string`</p> | <p>The remote url of the repository. It helps 'Rush change' finds the right remote to compare against.</p> |
|  <p>[rushJsonFile](./rush-lib.rushconfiguration.rushjsonfile.md)</p> |  | <p>`string`</p> | <p>The absolute path to the "rush.json" configuration file that was loaded to construct this object.</p> |
|  <p>[rushJsonFolder](./rush-lib.rushconfiguration.rushjsonfolder.md)</p> |  | <p>`string`</p> | <p>The absolute path of the folder that contains rush.json for this project.</p> |
|  <p>[rushLinkJsonFilename](./rush-lib.rushconfiguration.rushlinkjsonfilename.md)</p> |  | <p>`string`</p> | <p>The filename of the build dependency data file. By default this is called 'rush-link.json' resides in the Rush common folder. Its data structure is defined by IRushLinkJson.</p><p>Example: `C:\MyRepo\common\temp\rush-link.json`</p> |
|  <p>[shrinkwrapFilePhrase](./rush-lib.rushconfiguration.shrinkwrapfilephrase.md)</p> |  | <p>`string`</p> | <p>Returns an English phrase such as "shrinkwrap file" that can be used in logging messages to refer to the shrinkwrap file using appropriate terminology for the currently selected package manager.</p> |
|  <p>[telemetryEnabled](./rush-lib.rushconfiguration.telemetryenabled.md)</p> |  | <p>`boolean`</p> | <p><b><i>(BETA)</i></b> Indicates whether telemetry collection is enabled for Rush runs.</p> |
|  <p>[tempShrinkwrapFilename](./rush-lib.rushconfiguration.tempshrinkwrapfilename.md)</p> |  | <p>`string`</p> | <p>The full path of the temporary shrinkwrap file that is used during "rush install". This file may get rewritten by the package manager during installation.</p> |
|  <p>[tempShrinkwrapPreinstallFilename](./rush-lib.rushconfiguration.tempshrinkwrappreinstallfilename.md)</p> |  | <p>`string`</p> | <p>The full path of a backup copy of tempShrinkwrapFilename. This backup copy is made before installation begins, and can be compared to determine how the package manager modified tempShrinkwrapFilename.</p> |
|  <p>[versionPolicyConfiguration](./rush-lib.rushconfiguration.versionpolicyconfiguration.md)</p> |  | <p>`VersionPolicyConfiguration`</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[yarnCacheFolder](./rush-lib.rushconfiguration.yarncachefolder.md)</p> |  | <p>`string`</p> | <p>The local folder that will store the Yarn package cache.</p><p>Example: `C:\MyRepo\common\temp\yarn-cache`</p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[findProjectByShorthandName(shorthandProjectName)](./rush-lib.rushconfiguration.findprojectbyshorthandname.md)</p> |  | <p>This is used e.g. by command-line interfaces such as "rush build --to example". If "example" is not a project name, then it also looks for a scoped name like `@something/example`<!-- -->. If exactly one project matches this heuristic, it is returned. Otherwise, undefined is returned.</p> |
|  <p>[findProjectByTempName(tempProjectName)](./rush-lib.rushconfiguration.findprojectbytempname.md)</p> |  | <p>Looks up a project by its RushConfigurationProject.tempProjectName field.</p> |
|  <p>[getCommittedShrinkwrapFilename(variant)](./rush-lib.rushconfiguration.getcommittedshrinkwrapfilename.md)</p> |  | <p>Gets the committed shrinkwrap file name for a specific variant.</p> |
|  <p>[getCommonVersions(variant)](./rush-lib.rushconfiguration.getcommonversions.md)</p> |  | <p>Gets the settings from the common-versions.json config file for a specific variant.</p> |
|  <p>[getPnpmfilePath(variant)](./rush-lib.rushconfiguration.getpnpmfilepath.md)</p> |  | <p>Gets the absolute path for "pnpmfile.js" for a specific variant.</p> |
|  <p>[getProjectByName(projectName)](./rush-lib.rushconfiguration.getprojectbyname.md)</p> |  | <p>Looks up a project in the projectsByName map. If the project is not found, then undefined is returned.</p> |
|  <p>[loadFromConfigurationFile(rushJsonFilename)](./rush-lib.rushconfiguration.loadfromconfigurationfile.md)</p> | <p>`static`</p> | <p>Loads the configuration data from an Rush.json configuration file and returns an RushConfiguration object.</p> |
|  <p>[loadFromDefaultLocation()](./rush-lib.rushconfiguration.loadfromdefaultlocation.md)</p> | <p>`static`</p> |  |
|  <p>[tryFindRushJsonLocation(verbose)](./rush-lib.rushconfiguration.tryfindrushjsonlocation.md)</p> | <p>`static`</p> | <p>Find the rush.json location and return the path, or undefined if a rush.json can't be found.</p> |
|  <p>[tryGetProjectForPath(currentFolderPath)](./rush-lib.rushconfiguration.trygetprojectforpath.md)</p> |  | <p>Returns the project for which the specified path is underneath that project's folder. If the path is not under any project's folder, returns undefined.</p> |

