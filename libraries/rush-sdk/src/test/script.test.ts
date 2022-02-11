import { Executable, PackageJsonLookup } from '@rushstack/node-core-library';

const rushSdkPackagePath: string = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname)!;
const rushSdkPath: string = `${rushSdkPackagePath}/lib/index`;
const rushSdkLoaderPath: string = `${rushSdkPackagePath}/loader`;
const sandboxRepoPath: string = `${__dirname}/sandbox`;
const mockPackageFolder: string = `${sandboxRepoPath}/mock-package`;
const mockRushLibPath: string = `${__dirname}/fixture/mock-rush-lib.js`;

const coreLibPath: string = require.resolve('@rushstack/node-core-library');

describe('used in script', () => {
  it('should work when used in script', () => {
    const result = Executable.spawnSync(
      'node',
      [
        '-e',
        `
const { Import } = require(${JSON.stringify(coreLibPath)});
const originalResolveModule = Import.resolveModule;
const mockResolveModule = (options) => {
  if (options.baseFolderPath.includes('install-run') && options.modulePath === '@microsoft/rush-lib') {
    return ${JSON.stringify(mockRushLibPath)};
  }
  return originalResolveModule(options);
}
Import.resolveModule = mockResolveModule;
const { RushSdkLoader } = require(${JSON.stringify(rushSdkLoaderPath)});
RushSdkLoader.install();
console.log(require(${JSON.stringify(rushSdkPath)}));
`
      ],
      {
        currentWorkingDirectory: mockPackageFolder
      }
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toMatchInlineSnapshot(`""`);
    expect(result.stdout.trim()).toMatchInlineSnapshot(`"{ foo: [Getter] }"`);
  });
});
