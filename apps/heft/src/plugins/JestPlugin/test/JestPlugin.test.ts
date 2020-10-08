import { JestPlugin } from '../JestPlugin';

describe('JestPlugin', () => {
  test('throws when no config file is found', async () => {
    // @ts-expect-error
    const plugin: {  _runJestAsync: (...args: unknown[]) => Promise<void> } = new JestPlugin();
    await expect(
      plugin._runJestAsync(
        {
          requestScopedLogger: () => ({
            emitError: (error) => {
              throw error;
            }
          })
        },
        { buildFolder: __dirname },
        {}
      )
    ).rejects.toThrowError(/Expected to find jest config file at .*config[/\\]jest\.config\.json/);
  });
});
