'use strict';

module.exports = {
  hooks: {
    readPackage
  }
};

/**
 * This hook is invoked during installation before a package's dependencies
 * are selected.
 * The `packageJson` parameter is the deserialized package.json
 * contents for the package that is about to be installed.
 * The `context` parameter provides a log() function.
 * The return value is the updated object.
 */
function readPackage(packageJson, context) {
  if (packageJson.name === '@types/karma') {
    context.log('Fixed up dependencies for @types/karma');
    packageJson.dependencies['log4js'] = '0.6.38';
  }

  return packageJson;
}
