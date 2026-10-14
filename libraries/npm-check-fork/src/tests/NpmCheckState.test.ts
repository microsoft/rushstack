import type { INpmCheckPackageJson, INpmCheckState } from '../interfaces/INpmCheck';
import initializeState from '../NpmCheckState';

describe('NpmCheckState', () => {
  it('should create with default options', async () => {
    const state: INpmCheckState = await initializeState();
    expect(state).toBeDefined();
    expect(state.cwd).toBe(process.cwd());
    expect(state.cwdPackageJson).toHaveProperty('name');
    expect(state.cwdPackageJson).toHaveProperty('version');
  });

  it('should use the provided package.json instead of reading it from cwd', async () => {
    const cwdPackageJson: INpmCheckPackageJson = {
      name: 'provided-package',
      version: '1.2.3',
      dependencies: { 'example-dependency': '^1.0.0' },
      devDependencies: {}
    };
    const state: INpmCheckState = await initializeState({ cwd: process.cwd(), cwdPackageJson });
    expect(state.cwd).toBe(process.cwd());
    expect(state.cwdPackageJson).toBe(cwdPackageJson);

    // The provided package.json must not leak into later calls
    const laterState: INpmCheckState = await initializeState({ cwd: process.cwd() });
    expect(laterState.cwdPackageJson?.name).toBe('@rushstack/npm-check-fork');
  });
});
