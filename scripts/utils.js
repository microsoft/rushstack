let fs = require('fs');
let rimraf = require('rimraf');

function fileExists(path) {
  let exists = false;
  try {
    let lstat = fs.lstatSync(path);
    exists = lstat.isFile();
  } catch (e) { }

  return exists;
}

function directoryExists(path) {
  let exists = false;
  try {
    let lstat = fs.lstatSync(path);
    exists = lstat.isDirectory();
  } catch (e) { }

  return exists;
}

function deleteFile(filePath) {
   return new Promise(done => {
    if (fileExists(filePath)) {
      console.log(`Deleting: ${filepath}`);
      fs.unlinkSync(filePath);
    }

    done();
  });
}

function deleteDirectory(directoryPath) {
   return new Promise(done => {
    if (directoryExists(directoryPath)) {
      console.log(`Deleting: ${directoryPath}`);
      rimraf(directoryPath, done);
    } else {
      done();
    }
  });
}

module.exports = {
  fileExists,
  directoryExists,
  deleteFile,
  deleteDirectory
};
