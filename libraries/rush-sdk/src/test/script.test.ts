import * as path from 'path';
import { Executable } from '@rushstack/node-core-library';

const rushSdkPath: string = path.join(__dirname, '../../lib/index.js');
const sandboxRepoPath: string = path.join(__dirname, './sandbox');
const mockPackageFolder: string = path.join(sandboxRepoPath, 'mock-package');

describe('used in script', () => {
  it('should work when used in script', () => {
    const result = Executable.spawnSync('node', ['-e', `console.log(require(\"${rushSdkPath}\"))`], {
      currentWorkingDirectory: mockPackageFolder
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toMatchInlineSnapshot(`
      "{
        ApprovedPackagesPolicy: [Getter],
        RushConfiguration: [Getter],
        PackageManagerOptionsConfigurationBase: [Getter],
        PnpmOptionsConfiguration: [Getter],
        NpmOptionsConfiguration: [Getter],
        YarnOptionsConfiguration: [Getter],
        EnvironmentConfiguration: [Getter],
        EnvironmentVariableNames: [Getter],
        RushConstants: [Getter],
        PackageManager: [Getter],
        RushConfigurationProject: [Getter],
        RushUserConfiguration: [Getter],
        _RushGlobalFolder: [Getter],
        ApprovedPackagesItem: [Getter],
        ApprovedPackagesConfiguration: [Getter],
        CommonVersionsConfiguration: [Getter],
        PackageJsonEditor: [Getter],
        PackageJsonDependency: [Getter],
        DependencyType: [Getter],
        RepoStateFile: [Getter],
        LookupByPath: [Getter],
        EventHooks: [Getter],
        Event: [Getter],
        ChangeManager: [Getter],
        _LastInstallFlag: [Getter],
        VersionPolicyDefinitionName: [Getter],
        BumpType: [Getter],
        LockStepVersionPolicy: [Getter],
        IndividualVersionPolicy: [Getter],
        VersionPolicy: [Getter],
        VersionPolicyConfiguration: [Getter],
        Rush: [Getter],
        ExperimentsConfiguration: [Getter],
        ProjectChangeAnalyzer: [Getter],
        RushSession: [Getter],
        RushLifecycleHooks: [Getter],
        CredentialCache: [Getter]
      }"
    `);
  });
});
