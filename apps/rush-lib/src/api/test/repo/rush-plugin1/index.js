const pluginName = 'RushPlugin1';
module.exports = class RushPlugin1 {
  constructor() {
    this.pluginName = pluginName;
  }
  apply(rushSession) {
    const logger = rushSession.getLogger(pluginName);
    rushSession.hooks.initialize.tap(pluginName, () => {
      logger.emitError('initialize');
    });
  }
};
