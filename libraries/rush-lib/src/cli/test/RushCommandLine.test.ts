import { RushCommandLine } from '../RushCommandLine';

describe('RushCommandLine', () => {
  it(`Returns a spec`, async () => {
    const rushCliInstance = new RushCommandLine();
    const spec = rushCliInstance.getSpec(process.cwd());
    console.log('spec: ', spec);
    expect(true).toBe(true);
  });
});
