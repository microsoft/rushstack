const path = require("path");
const fs = require("fs");
const install_run_1 = require("./install-run");
const PACKAGE_NAME = '@microsoft/rush';

function getRushVersion() {
   const rushJsonFolder = install_run_1.findRushJsonFolder();
    const rushJsonPath = path.join(rushJsonFolder, install_run_1.RUSH_JSON_FILENAME);
    try {
        const rushJsonContents = fs.readFileSync(rushJsonPath, 'utf-8');
        // Use a regular expression to parse out the rushVersion value because rush.json supports comments,
        // but JSON.parse does not and we don't want to pull in more dependencies than we need to in this script.
        const rushJsonMatches = rushJsonContents.match(/\"rushVersion\"\s*\:\s*\"([0-9a-zA-Z.+\-]+)\"/);
        return rushJsonMatches[1];
    }
    catch (e) {
        throw new Error(`Unable to determine the required version of Rush from rush.json (${rushJsonFolder}). ` +
            'The \'rushVersion\' field is either not assigned in rush.json or was specified ' +
            'using an unexpected syntax.');
    }
 }

 function run() {
    const [nodePath, /* Ex: /bin/node */ scriptPath, /* /repo/common/scripts/install-run-rush.js */ ...packageBinArgs /* [build, --to, myproject] */] = process.argv;
    console.log("sriptpath="+scriptPath);
    const scriptName = path.basename(scriptPath);
    const bin = scriptName.toLowerCase() === 'install-run-rushx.js' ? 'rushx' : 'rush';
    if (!nodePath || !scriptPath) {
      throw new Error('Unexpected exception: could not detect node path or script path');
    }
    if (process.argv.length < 3) {
    console.log(`Usage: ${scriptName} <command> [args...]`);
    console.log(`Example: ${scriptName} build`);
    process.exit(1);
    }
    install_run_1.runWithErrorAndStatusCode(() => {
      const version = getRushVersion();
      console.log(`The rush.json configuration requests Rush version ${version}`);
      return install_run_1.installAndRun(PACKAGE_NAME, version, bin, packageBinArgs);
    });
 }
 run();
