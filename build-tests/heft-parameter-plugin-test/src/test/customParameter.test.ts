import { dirname } from 'path';
import { FileSystem } from '@rushstack/node-core-library';

describe('CustomParameterOutput', () => {
  it('parses command line arguments and prints output.', async () => {
    const outputContent: string = await FileSystem.readFileAsync(
      `${dirname(dirname(__dirname))}/lib/custom_output.txt`
    );
    expect(outputContent).toBe('testtesttesttesttest_eevee_togepi_mareep');
  });
});
