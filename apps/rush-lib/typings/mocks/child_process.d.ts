import * as child from 'child_process';

declare module 'child_process' {
  /**
   * See `__mocks__/child_process.js`.
   */
  export interface ISpawnMockConfig {
    emitError: boolean;
    returnCode: number;
  }

  export interface ChildProcessModuleMock {
    /**
     * Initialize the `spawn` mock behavior.
     */
    __setSpawnMockConfig(config?: ISpawnMockConfig): void;

    spawn: jest.Mock;
  }
}

