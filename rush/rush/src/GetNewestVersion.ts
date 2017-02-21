/*
import * as _ from 'lodash';
import * as semver from 'semver';

const evergreenPackages: string[] = [
  'A',
  'B'
];

const packages: { [project: string]: {[version: string]: { [dep: string]: string }} } = {
  'A': {
    '1.2.0': {
      'B': '0.0.40'
    },
    '1.3.0': {
      'B': '0.0.41'
    }
  },
  'B': {
    '0.0.40': {},
    '0.0.41': {}
  }
};

const projects: {[project: string]: { [dep: string]: string }} = {
  'C': {
    'A': '1.2.0',
    'B': '0.0.40'
  }
};

function isEvergreen(project: string): boolean {
  return evergreenPackages.indexOf(project) !== -1;
}

function sortVersions(versions: string[]): string[] {
  return versions.sort(semver.rcompare);
}

function tryAddVersion(context, dependency, version) {
  // Create a new context assuming we are using this version
  let newContext = _.cloneDeep(context);
  newContext[dependency] = version;

  const dependencies = packages[dependency][version];
  // Iterate through each dependency
  for (var dep in dependencies) {
    if (isEvergreen(dep)) {
      newContext = addDependency(newContext, dep);
    }
  }
  return newContext;
}

function getNewestCompatibleVersion(context, dependency: string) {
  console.log('dependency: ' + dependency);
  const possibleVersions: string[] = sortVersions(Object.keys(packages[dependency]));
  for (var version of possibleVersions) {
    const newContext = tryAddVersion(context, dependency, version);
    if (newContext) {
      return newContext;
    }
  }
  return undefined;
}

function addDependency(context, dependency: string): { [project: string]: string } {
  if (context[dependency]) {
    return context;
  } else {
    return getNewestCompatibleVersion(context, dependency);
  }
}

function solveEvergreen() {
  let context: { [project: string]: string } = {};
  for (var dependency of evergreenPackages) {
    context = addDependency(context, dependency);
    if (!context) {
      return undefined;
    }
  }
  return context;
}

const solved = solveEvergreen();
console.log(JSON.stringify(solved, undefined, 2));
*/