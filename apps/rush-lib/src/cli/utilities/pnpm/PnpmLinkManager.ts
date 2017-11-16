import LinkManager from '../LinkManager';

export default class PnpmLinkManager extends LinkManager {
  protected _linkProjects(): Promise<void> {
    return Promise.resolve();
  }
}