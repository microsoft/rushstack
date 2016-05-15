import CommandLineParser from '../commandLine/CommandLineParser';
import RushConfig from '../data/RushConfig';
import LinkAction from './LinkAction';
import RebuildAction from './RebuildAction';
import UpdateAction from './UpdateAction';

export default class RushCommandLineParser extends CommandLineParser {
  public rushConfig: RushConfig;

  constructor() {
    super({
      toolFilename: 'rush',
      toolDescription: 'This tools helps you to manage building/installing of multiple NPM package folders.'
    });

    this.addCommand(new UpdateAction(this));
    this.addCommand(new LinkAction(this));
    this.addCommand(new RebuildAction(this));
  }
}
