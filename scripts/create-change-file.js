'use strict';
 
let fs = require('fs');
let glob = require('glob')
let guid = require('guid');
let inquirer = require('inquirer');
let path = require('path')

let packages = [];  // keeps track of package.json files that have been found
let answers = {};
let data = [];

// Gets all the package.json files under the current executing directory
let getPackages = () => {
    glob('**!(node_modules)/package.json', /*options*/ {}, (error, files) => {
        packages = files.forEach((file) => {
            packages.push(path.basename(path.dirname(file)));   // push the package name of the parent directory
        });;
        promptUser();
    });
}

// Questions related to the project. Had to split into two sets of questions in case user selects additional help
let projectQuestions = [
    {
      name: 'projectName',
      type: 'list',
      message: 'Select the project you would like to bump:',
      choices: packages
    },
    {
        name: 'bumpType',
        type: 'list',
        message: 'Select the type of change:',
        default: 'patch',
        choices: [
            'major - for breaking changes (ex: renaming a file)',
            'minor - for adding new features (ex: exposing a new public API)',
            'patch - for fixes (ex: updating how an API works w/o touching its signature)',
            'help'
        ]
    }
];

// Questions related to the change
let changeQuestions = [
    {
        name: 'comments',
        type: 'input',
        message: 'Please add any comments to help explain this change:'
    },
    {
        name: 'addMore',
        type: 'confirm',
        message: 'Would you like to bump any additional projects?'
    }
]

let promptUser = () => {
    let prompt = inquirer.createPromptModule();

    prompt(projectQuestions).then((answers) => {
        if (answers.bumpType.startsWith('help')) {
            help();
        } else {
            let projectInfo = {
                packageName: answers.projectName,
                type: answers.bumpType.substring(0, answers.bumpType.indexOf(" - "))
            };

            prompt(changeQuestions).then((answers) => {
                projectInfo.comments = answers.comments;
                data.push(projectInfo);

                if (answers.addMore) {
                    promptUser();
                } else {
                    outputChangeFile();
                }
            });
        }
    });

    let outputChangeFile = () => {
        let output = JSON.stringify({
            changes : data
        });

        let fileName = './changes/' + guid.create() + '.json';
        fs.writeFile(fileName, output);
        console.log('Create new changes file: ' + fileName);
    };
};

let help = () => {
    console.log("Here's some help in figuring out what kind of change you are making:");
    console.log("");
    console.log("MAJOR - these are breaking changes that are not backwards compatible.");
    console.log("Examples are: renaming a file/class, adding/removing a non-optional");
    console.log("parameter from a public API, or renaming an variable or function that");
    console.log("is exported.")
    console.log("");
    console.log("MINOR - these are changes that are backwards compatible (but not");
    console.log("forwards compatible. Examples are: adding a new public API or adding an");
    console.log("optional parameter to a public API");
    console.log("");
    console.log("PATCH - these are changes that are backwards and forwards compatible.");
    console.log("Examples are: Modifying a private API or fixing a bug in the logic");
    console.log("of how an existing API works.");
    console.log("");
};

getPackages();