import { StringBufferTerminalProvider, Terminal } from '@rushstack/node-core-library';
import {
  RUSH_PROJECT_CONFIGURATION_FILE,
  RushProjectConfiguration,
  IRushProjectJson
} from '../RushProjectConfiguration';

describe(RushProjectConfiguration.name, () => {
  it('loads a rush-project.json config that extends another config file', async () => {
    const testFolder: string = `${__dirname}/jsonFiles/test-project-a`;
    const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());
    const rushProjectJson: IRushProjectJson =
      await RUSH_PROJECT_CONFIGURATION_FILE.loadConfigurationFileForProjectAsync(terminal, testFolder);
    expect(rushProjectJson.operationSettings?.length).toEqual(2);
    expect(rushProjectJson.operationSettings?.[0].operationName).toMatchInlineSnapshot(`"_phase:a"`);
    expect(rushProjectJson.operationSettings?.[0].outputFolderNames).toMatchInlineSnapshot(`
      Array [
        "a-a",
        "a-b",
      ]
    `);
    expect(rushProjectJson.operationSettings?.[1].operationName).toMatchInlineSnapshot(`"_phase:b"`);
    expect(rushProjectJson.operationSettings?.[1].outputFolderNames).toMatchInlineSnapshot(`
      Array [
        "b-a",
      ]
    `);
  });

  it('throws an error when loading a rush-project.json config that lists an operation twice', async () => {
    const testFolder: string = `${__dirname}/jsonFiles/test-project-b`;
    const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());
    try {
      await RUSH_PROJECT_CONFIGURATION_FILE.loadConfigurationFileForProjectAsync(terminal, testFolder);
      fail('Expected to throw');
    } catch (e) {
      const errorMessage: string = (e as Error).message
        .replace(/\\/g, '/')
        .replace(testFolder.replace(/\\/g, '/'), '<testFolder>');
      expect(errorMessage).toMatchInlineSnapshot(
        `"The operation \\"_phase:a\\" occurs multiple times in the \\"operationSettings\\" array in \\"<testFolder>/config/rush-project.json\\"."`
      );
    }
  });
});
