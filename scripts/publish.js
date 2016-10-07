'use strict';

let fs = require('fs');
let os = require('os');
let path = require('path');
let semver = require('semver');
let deleteFile = require('./utils').deleteFile;
let execSync = require('child_process').execSync;
let forEachPackage = require('./enumerate').forEachPackage;
let getAllProjects = require('./enumerate').getAllProjects;

let _downstreamDeps = getDownstreamDependencies();
let _allPackages = getAllProjects();
let _changeTypes = {
  major: 3,
  minor: 2,
  patch: 1,
  dependency: 0,
  3: 'major',
  2: 'minor',
  1: 'patch',
  0: 'dependency'
};

let _shouldCommit = process.argv.indexOf('--commit') >= 0;

/* Find all changes and return parsed change definitions. */
function findChangesSync() {
  let changeFiles = [];
  let allChanges = {};
  let changesPath = path.join(process.cwd(), 'changes');

  console.log(`Finding changes in: ${changesPath}`);

  try {
    changeFiles = fs.readdirSync(changesPath).filter(filename => filename.indexOf('.json') >= 0);
  } catch (e) { }

  // Add the minimum changes defined by the change descriptions.
  changeFiles.forEach((file) => {
    let fullPath = path.resolve('./changes', file);
    let changeDescription = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

    for (let i = 0; i < changeDescription.changes.length; i++) {
      let change = changeDescription.changes[i];

      addChange(allChanges, change);
    }
  });

  let packages = Object.keys(allChanges);
  let updatedDeps = {};

  // Update orders so that downstreams are marked to come after upstreams.
  for (let packageName in allChanges) {
    let change = allChanges[packageName];
    let pkg = _allPackages[packageName].package;
    let deps = _downstreamDeps[packageName];

    // Write the new version expected for the change.
    change.newVersion = (change.changeType > _changeTypes.dependency) ? semver.inc(pkg.version, _changeTypes[change.changeType]) : pkg.version;

    if (deps) {
      for (let depName of deps) {
        let depChange = allChanges[depName];

        if (depChange) {
          depChange.order = Math.max(change.order + 1, depChange.order);
        }
      }
    }
  }

  return allChanges;
}

/** Add a change request to the allChanges dictionary if necessary. */
function addChange(allChanges, change) {
  let packageName = change.packageName;
  let pkgEntry = _allPackages[packageName];

  if (!pkgEntry) {
    throw `The package ${packageName} was requested for publishing but does not exist. Please fix change requests.`;
  }

  let pkg = pkgEntry.package;
  let currentChange;

  if (!allChanges[packageName]) {
    currentChange = allChanges[packageName] = {
      packageName,
      packagePath: pkgEntry.path,
      changeType: _changeTypes[change.type],
      comments: change.comments || [],
      order: 0,
      changes: [change]
    };
  } else {
    currentChange = allChanges[packageName];
    currentChange.changeType = Math.max(currentChange.changeType, _changeTypes[change.type]);
    currentChange.comments = currentChange.comments.concat(change.comments);
    currentChange.changes.push(change);
  }

  currentChange.newVersion = currentChange.changeType > 0 ? semver.inc(pkg.version, _changeTypes[currentChange.changeType]) : pkg.version;
  currentChange.newVersionRange = `>=${currentChange.newVersion} <${semver.inc(currentChange.newVersion, 'major')}`;

  updateDownstreamDependencies(allChanges, packageName, currentChange.newVersionRange);
}

/** Build a downstream dependencies lookup table. */
function getDownstreamDependencies() {
  let downstreamDeps = {};

  forEachPackage('.', (pkg, location) => {
    for (let depName in pkg.dependencies) {
      if (!downstreamDeps[depName]) {
        downstreamDeps[depName] = [];
      }
      downstreamDeps[depName].push(pkg.name);
    }
  });

  return downstreamDeps;
}

function updateDownstreamDependencies(allChanges, packageName, newVersionRange) {
  let change = allChanges[packageName];
  let downstreamNames = _downstreamDeps[packageName];

  // Iterate through all downstream dependencies for the package.
  if (downstreamNames) {
    for (let depName of downstreamNames) {
      let pkgEntry = _allPackages[depName];
      let pkg = pkgEntry.package;
      let requiredVersion = pkgEntry.package.dependencies[packageName];

      // If the version range has not yet been updated to this version, update it.
      if (requiredVersion !== newVersionRange) {
        pkgEntry.package.dependencies[packageName] = newVersionRange;

        // Either it already satisfies the new version, or doesn't. If not, the downstream dep needs to be republished.
        let changeType = semver.satisfies(change.newVersion, requiredVersion) ? _changeTypes.dependency : _changeTypes.patch;

        addChange(allChanges, {
          packageName: pkg.name,
          type: _changeTypes[changeType],
          comments: [`Updating ${packageName}: ${newVersionRange} (was ${ requiredVersion })`]
        });
      }
    }
  }
}

/** Update the package.json for a given change. */
function updatePackage(change, allChanges) {
  console.log(os.EOL + `* Applying ${_changeTypes[change.changeType]} update for ${change.packageName} to ${change.newVersion}`);

  let pkg = _allPackages[change.packageName].package;

  pkg.version = change.newVersion;

  change.changes.forEach(subChange => subChange.comments.forEach(comment => console.log( ` - [${subChange.type}] ${comment}`)));

  if (_shouldCommit) {
    fs.writeFileSync(change.packagePath, JSON.stringify(pkg, null, 2), 'utf8');
  }
}

function execCommand(commandLine, workingPath, isDisabled) {
  workingPath = workingPath || process.cwd();

  console.log(`Executing: "${commandLine}" from ${workingPath}`);

  if (_shouldCommit && !isDisabled) {
    execSync(commandLine, {
      cwd: workingPath,
      stdio: [0, 1, 2]
    });
  }
}

function gitAddChanges() {
  execCommand('git add .');
}

function gitAddTags(allChanges) {
  for (let packageName in allChanges) {
    let change = allChanges[packageName];

    if (change.changeType > _changeTypes.dependency) {
      let tagName = packageName + '_v' + change.newVersion;

      execCommand(`git tag -a ${tagName} -m "${packageName} v${change.newVersion}"`);
    }
  }
}

function gitCommit() {
  execCommand('git commit -m "Applying package updates."');
}

function gitPush() {
  execCommand('git push origin refs/heads/master:refs/heads/master --follow-tags --verbose');
}

function publishPackage(change) {
  execCommand(`npm publish`, change.packagePath);
}

function deleteChangeFiles() {
  let changesPath = path.join(process.cwd(), 'changes');
  let changeFiles = [];

  try {
    changeFiles = fs.readdirSync(changesPath).filter(filename => filename.indexOf('.json') >= 0);
  } catch (e) { }

  if (changeFiles.length) {
    console.log(os.EOL + `Deleting ${changeFiles.length} change file(s).`);

    for (let fileName of changeFiles) {
      let filePath = path.join(changesPath, fileName);

      console.log(` - ${filePath}`);

      if (_shouldCommit) {
        deleteFile(filePath);
      }
    }
  }
}

/** Apply set of changes. */
function applyChanges(allChanges) {
  let orderedChanges = (
    Object
      .keys(allChanges)
      .map(key => allChanges[key])
      .sort((a, b) => a.order < b.order ? -1 : 1));

  if (orderedChanges.length > 1) {
    for (let change of orderedChanges) {
      updatePackage(change, allChanges);
    }

    deleteChangeFiles();
    gitAddChanges(allChanges);
    gitCommit();
    gitAddTags(allChanges);
    gitPush();

    for (let change of orderedChanges) {
      if (change.changeType > _changeTypes.dependency) {
        publishPackage(change);
      }
    }
  }
}


let changes = findChangesSync();

applyChanges(changes);