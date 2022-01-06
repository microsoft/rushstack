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
    expect(rushProjectJson.projectOutputFolderNames).toMatchInlineSnapshot(`
      Array [
        "a",
        "b",
      ]
    `);
    expect(rushProjectJson.phaseOptions?.length).toEqual(2);
    expect(rushProjectJson.phaseOptions?.[0].phaseName).toMatchInlineSnapshot(`"_phase:a"`);
    expect(rushProjectJson.phaseOptions?.[0].projectOutputFolderNames).toMatchInlineSnapshot(`
      Array [
        "a-a",
        "a-b",
      ]
    `);
    expect(rushProjectJson.phaseOptions?.[1].phaseName).toMatchInlineSnapshot(`"_phase:b"`);
    expect(rushProjectJson.phaseOptions?.[1].projectOutputFolderNames).toMatchInlineSnapshot(`
      Array [
        "b-a",
      ]
    `);
  });

  it('throws an error when loading a rush-project.json config that lists a phase twice', async () => {
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
        `"The phase \\"_phase:a\\" occurs multiple times in the \\"phaseOptions\\" array in \\"<testFolder>/config/rush-project.json\\"."`
      );
    }
  });
});
