'use strict';
 
let fs = require('fs');
let glob = require('glob')
let guid = require('guid');
let inquirer = require('inquirer');

let packages = [];  // keeps track of package.json files that have been found
let answers = {};
let data = [];

// Gets all the package.json files under the current executing directory
let getPackages = () => {
    glob('**/package.json', /*options*/ {}, (error, files) {
        packages = files;
        promptUser();
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

getPackages();