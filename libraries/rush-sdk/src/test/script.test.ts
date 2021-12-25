import * as path from 'path';
import { Executable } from '@rushstack/node-core-library';

const rushSdkPath: string = path.join(__dirname, '../../lib/index.js');
const sandboxRepoPath: string = path.join(__dirname, './sandbox');
const mockPackageFolder: string = path.join(sandboxRepoPath, 'mock-package');
const mockRushLibPath: string = path.join(__dirname, './fixture/mock-rush-lib.js');

const coreLibPath: string = require.resolve('@rushstack/node-core-library');

describe('used in script', () => {
  it('should work when used in script', () => {
    const result = Executable.spawnSync(
      'node',
      [
        '-e',
        `
const { Import } = require("${coreLibPath}");
const originalResolveModule = Import.resolveModule;
const mockResolveModule = (options) => {
  if (options.baseFolderPath.includes('install-run') && options.modulePath === '@microsoft/rush-lib') {
    return "${mockRushLibPath}";
  }
  return originalResolveModule(options);
}
Import.resolveModule = mockResolveModule;
console.log(require("${rushSdkPath}"));
`
      ],
      {
        currentWorkingDirectory: mockPackageFolder
      }
    );
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toMatchInlineSnapshot(`"{ foo: [Getter] }"`);
  });
});
