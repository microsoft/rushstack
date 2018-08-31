"use strict";

/**
 * This file defined custom hooks for pnpm
 * It is designed to be used to fixup "bad packages"
 * which require() things that are not in their package.json
 * This file is copied to the /common/temp folder during
 * "rush install" and "rush generate".
 *
 * You can read more about this file here:
 * https://github.com/pnpm/pnpm#hooks
 * https://github.com/pnpm/pnpm/issues/949
 *
 * Also, pnpm is considering moving this file to a better format,
 * such as a JSON configuration, rather than letting people
 * write their own custom hooks.
 *
 * DO NOT MODIFY THIS FILE UNLESS YOU KNOW WHAT YOU ARE DOING
 */
module.exports = {
  hooks: {
    readPackage
  }
};

/**
 * This is the hook that is called after downloading a package.json
 * The variable `pkg` is a package.json object
 * We are expected to return the object.
 */
function readPackage(pkg) {
  // tslint-microsoft-contrib and tslint have peerDependencies on typescript, but now we have two copies
  //  in the repo so it doesn't know which one to pick
  if (pkg.name === 'tslint-microsoft-contrib' || pkg.name === 'tslint') {
    pkg.dependencies['typescript'] = '~2.4.1';
    delete pkg.peerDependencies['typescript'];
  }

  return pkg
}