import { dirname } from 'path';
import { FileSystem } from '@rushstack/node-core-library';

describe('CustomParameterOutput', () => {
  it('parses command line arguments and prints output.', async () => {
    const outputContent: string = await FileSystem.readFileAsync(
      `${dirname(dirname(__dirname))}/temp/test/write-parameters/custom_output.txt`
    );
    expect(outputContent).toBe(
      'customIntegerParameter: 5\n' +
        'customIntegerListParameter: 6, 7\n' +
        'customStringParameter: test\n' +
        'customStringListParameter: eevee, togepi, mareep\n' +
        'customChoiceParameter: red\n' +
        'customChoiceListParameter: totodile, gudetama, wobbuffet'
    );
  });
});
