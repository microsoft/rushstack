import { dirname } from 'path';
import { FileSystem } from '@rushstack/node-core-library';

describe('CustomParameterOutput', () => {
  it('parses command line arguments and prints output.', async () => {
    const outputContent: string = await FileSystem.readFileAsync(
      `${dirname(dirname(__dirname))}/lib/custom_output.txt`
    );
    expect(outputContent).toBe(
      'customIntegerParameter: 5\n' +
        'customStringParameter: test\n' +
        'customStringListParameter: eevee, togepi, mareep\n' +
        'customChoiceParameter: red\n' +
        'customChoiceListParameter: totodile, gudetama, wobbuffet'
    );
  });
});
