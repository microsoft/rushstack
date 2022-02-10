import * as path from 'path';
import { RushConfiguration } from "../..";
import { Git } from "../Git";
import { PublishGit } from "../PublishGit";
import { PublishUtilities } from '../PublishUtilities';

describe('PublishGit Test', () => {
  it('Test git with no command line arg tag', () => {
    const execCommand = jest.fn()
    PublishUtilities.execCommand = execCommand

    const rushFilename: string = path.resolve(__dirname, '../../api/test/repo', 'rush-npm.json');
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
    const git: Git = new Git(rushConfiguration);
    const publishGit: PublishGit = new PublishGit(git, 'test');

    publishGit.addTag(
      false,
      'project1',
      '2',
      undefined,
      undefined // This is undefined to simulate `rush publish ...` without --tag
    )
    expect(execCommand).toBeCalledTimes(1)
    expect(execCommand).toBeCalledWith(
      false,
      '/usr/local/bin/git',
      [
        'tag',
        '-a',
        `project1_v2`,
        '-m',
        'project1 v2',
    ])
  })

  it('Test git with command line arg tag', () => {
    const execCommand = jest.fn()
    PublishUtilities.execCommand = execCommand

    const rushFilename: string = path.resolve(__dirname, '../../api/test/repo', 'rush-npm.json');
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
    const git: Git = new Git(rushConfiguration);
    const publishGit: PublishGit = new PublishGit(git, 'test');

    publishGit.addTag(
      false,
      'project1',
      '2',
      undefined,
      'new_version_tag' // Simulates `rush publish ... --tag new_version_tag`
    )
    expect(execCommand).toBeCalledTimes(1)
    expect(execCommand).toBeCalledWith(
      false,
      '/usr/local/bin/git',
      [
        'tag',
        '-a',
        `project1_v2-new_version_tag`,
        '-m',
        'project1 v2-new_version_tag',
    ])
  })
})
