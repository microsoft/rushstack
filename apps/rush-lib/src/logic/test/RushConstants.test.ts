import { RushConstants } from '../RushConstants';

describe('RushConstants', () => {
  it('should return the correct pnpm shrinkwrap filename', (done: jest.DoneCallback) => {
    expect(RushConstants.pnpmShrinkwrapFilename('2.0.0')).toEqual('shrinkwrap.yaml');

    expect(RushConstants.pnpmShrinkwrapFilename('3.0.0')).toEqual('pnpm-lock.yaml');

    done();
  });
});
