'use strict';

const fs = require('fs');
const path = require('path');

console.log('Using pnpmfile');

/**
 * When using the PNPM package manager, you can use pnpmfile.js to workaround
 * dependencies that have mistakes in their package.json file.  (This feature is
 * functionally similar to Yarn's "resolutions".)
 *
 * For details, see the PNPM documentation:
 * https://pnpm.js.org/docs/en/hooks.html
 *
 * IMPORTANT: SINCE THIS FILE CONTAINS EXECUTABLE CODE, MODIFYING IT IS LIKELY TO INVALIDATE
 * ANY CACHED DEPENDENCY ANALYSIS.  After any modification to pnpmfile.js, it's recommended to run
 * "rush update --full" so that PNPM will recalculate all version selections.
 */
module.exports = {
  hooks: {
    readPackage,
    afterAllResolved
  }
};

const tarballsJsonFolder = path.resolve(__dirname, '../temp/tarballs');
const tarballsJson = JSON.parse(fs.readFileSync(path.join(tarballsJsonFolder, 'tarballs.json')).toString());

function fixup(packageJson, dependencies) {
  if (!dependencies) {
    return;
  }

  for (const dependencyName of Object.keys(dependencies)) {
    const tarballFilename = tarballsJson[dependencyName.trim()];
    if (tarballFilename) {
      // This must be an absolute path, since a relative path would get resolved relative to an unknown folder
      const tarballSpecifier = 'file:' + path.join(tarballsJsonFolder, tarballFilename).split('\\').join('/');

      // console.log(`Remapping ${packageJson.name}: ${dependencyName} --> ${tarballSpecifier}`);
      dependencies[dependencyName] = tarballSpecifier;
    }
  }
}

/**
 * This hook is invoked during installation before a package's dependencies
 * are selected.
 * The `packageJson` parameter is the deserialized package.json
 * contents for the package that is about to be installed.
 * The `context` parameter provides a log() function.
 * The return value is the updated object.
 */
function readPackage(packageJson, context) {
  fixup(packageJson, packageJson.dependencies);
  fixup(packageJson, packageJson.devDependencies);
  fixup(packageJson, packageJson.optionalDependencies);
  return packageJson;
}

function afterAllResolved(lockfile, context) {
  // Remove the absolute path from the specifiers to avoid shrinkwrap churn
  for (const importerName of Object.keys(lockfile.importers || {})) {
    const importer = lockfile.importers[importerName];
    const specifiers = importer.specifiers;
    if (specifiers) {
      for (const dependencyName of Object.keys(specifiers)) {
        const tarballFilename = tarballsJson[dependencyName.trim()];
        if (tarballFilename) {
          const tarballSpecifier = 'file:' + tarballFilename;
          specifiers[dependencyName] = tarballSpecifier;
        }
      }
    }
  }

  // Delete the resolution.integrity hash for tarball paths to avoid shrinkwrap churn.
  // PNPM seems to ignore these hashes during installation.
  for (const packagePath of Object.keys(lockfile.packages || {})) {
    if (packagePath.startsWith('file:')) {
      const packageInfo = lockfile.packages[packagePath];
      const resolution = packageInfo.resolution;
      if (resolution && resolution.integrity && resolution.tarball) {
        delete resolution.integrity;
      }
    }
  }

  return lockfile;
}
