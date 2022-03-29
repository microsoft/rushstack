/* eslint-env es6 */
const path = require('path');
const fs = require('fs');
class RushMockFlushTelemetryPlugin {
  apply(rushSession, rushConfiguration) {
    const flushTelemetry = (data) => {
      const targetPath = path.resolve(rushConfiguration.commonTempFolder, 'test-telemetry.json');
      return fs.promises.writeFile(targetPath, JSON.stringify(data), 'utf-8');
    };
    rushSession.hooks.flushTelemetry.tapPromise('RushMockFlushTelemetryPlugin', flushTelemetry);
  }
}

module.exports = RushMockFlushTelemetryPlugin;
