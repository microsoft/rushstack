'use strict';
 
let fs = require('fs');
let inquirer = require('inquirer');
let path = require('path')
let guid = require('guid');

let packages = [];  // keeps track of package.json files that have been found
let answers = {};
let data = [];

// Gets all the package.json files under the current executing directory
let getPackages = (dir, done) => {
    fs.readdir(dir, (err, files) => {
        let remaining = files.length;

        if (remaining === 0) {
            done();
        }

        files.forEach((file) => {
            file = path.resolve(dir, file);
            fs.stat(file, (err, stat) => {
                if (stat && stat.isDirectory() && path.basename(file) !== 'node_modules') {   // found a directory, so call into that directory
                    getPackages(file, () => {
                        remaining--;
                        if (remaining === 0) {
                            done();
                        }
                    })
                } else {
                    if (path.basename(file) === 'package.json') {
                        packages.push(path.basename(path.dirname(file)));   // found a package.json file
                    }
                    remaining--;
                    if (remaining === 0) {
                        done();
                    }
                }   
            });
        });
    });
}

// List of questions to ask the user
let questions = [
    {
      name: 'projectName',
      type: 'list',
      message: 'Select the project you would like to bump',
      choices: packages
    },
    {
        name: 'bumpType',
        type: 'list',
        message: 'Select the type of bump',
        default: 'patch',
        choices: ['patch', 'minor', 'major']
    },
    {
        name: 'comments',
        type: 'input',
        message: 'Please add any comments to help explain what is contained in this new package version'
    },
    {
        name: 'addMore',
        type: 'confirm',
        message: 'Would you like to bump any additional projects?'
    }
];

let promptUser = () => {
    let prompt = inquirer.createPromptModule();

    prompt(questions).then((answers) => {
        let projectInfo = {
            packageName: answers.projectName,
            type: answers.bumpType,
            comments: answers.comments
        }
        data.push(projectInfo);

        if (answers.addMore) {
            promptUser();
        } else {
            outputChangeFile();
        }
    });

    let outputChangeFile = () => {
        let output = JSON.stringify({
            changes : data
        });

        let fileName = '../changes/' + guid.create() + '.json';
        fs.writeFile(fileName, output);
        console.log('Craeate new changes file: ' + fileName);
    }
};

getPackages('../', promptUser);