'use strict';

let fs = require('fs');
let path = require('path');
let { fileExists, directoryExists } = require('./utils');

let rootPackagePath = path.resolve('./package.json');

function findPackagesSync(dir, results) {
  let excludes = [
    '.git',
    'node_modules',
    'typings',
    'lib',
    'src',
    'dist',
    'coverage',
    'common'
  ];

  results = results || [];
  let list = fs.readdirSync(dir).filter(file => excludes.indexOf(file) === -1);

  list.forEach((file) => {
    let fullPath = path.resolve(dir, file);

    if (directoryExists(fullPath)) {
      findPackagesSync(fullPath, results);

    } else if (fullPath !== rootPackagePath && fileExists(fullPath) && path.basename(file) === 'package.json') {
      results.push(fullPath);
    }
  });

  return results;
}

function forEachPackage(dir, cb) {
  let packageCount = 0;
  let packageLocations = findPackagesSync('.');

  packageLocations.forEach(packageLocation => {
    // crack open packages.
    let data = fs.readFileSync(packageLocation, 'utf8');
    let pkg = JSON.parse(data);

    cb(pkg, packageLocation);
  });
}

function getAllProjects() {
  let allProjects = {};

  forEachPackage('.', (pkg, location) => {
    allProjects[pkg.name] = {
      package: pkg,
      path: location
    };
  });

  return allProjects;
}

function findReposSync(dir, results) {
  let excludes = [
    'node_modules'
  ];
  results = results || [];

  let list = fs.readdirSync(dir);

  list = list.filter(file => excludes.indexOf(file) === -1);

  list.forEach((file) => {
    let fullPath = path.resolve(dir, file);
    if (directoryExists(fullPath)) {
      if (file === '.git') {
        results.push(dir);
      } else {
        findReposSync(fullPath, results);
      }
    }
  });

  return results;
}

function forEachRepo(dir, cb) {
  findReposSync('.').forEach(repoPath => cb(repoPath));
}

module.exports = {
  findPackagesSync,
  forEachPackage,
  getAllProjects,
  findReposSync,
  forEachRepo
};
