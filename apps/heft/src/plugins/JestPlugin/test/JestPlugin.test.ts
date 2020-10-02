import { JestPlugin } from '../JestPlugin';

describe('JestPlugin', () => {
  test('throws when no config file is found', () => {
    const plugin = new JestPlugin();
    type ApplyParams = Parameters<typeof plugin.apply>;
    expect(() =>
      plugin.apply({} as ApplyParams[0], { buildFolder: __dirname } as ApplyParams[1])
    ).toThrowError(/Expected to find jest config file at .*config[/\\]jest\.config\.json/);
  });
});
