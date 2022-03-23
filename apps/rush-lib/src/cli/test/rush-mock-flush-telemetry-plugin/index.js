/* eslint-env es6 */
const path = require('path');
const fs = require('fs');
class RushMockFlushTelemetryPlugin {
  apply(rushSession, rushConfiguration) {
    const flushTelemetry = (data) => {
      const targetPath = path.resolve(rushConfiguration.commonTempFolder, 'test-telemetry.json');
      return new Promise((resolve, reject) => {
        fs.writeFile(targetPath, JSON.stringify(data), (err) => {
          if (err) {
            reject(err);
          }
          resolve();
        });
      });
    };
    rushSession.hooks.flushTelemetry.tapPromise('RushMockFlushTelemetryPlugin', flushTelemetry);
  }
}

module.exports = RushMockFlushTelemetryPlugin;
