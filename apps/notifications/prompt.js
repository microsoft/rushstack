const inquirer = require('inquirer');

async function promptToUser() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'display',
      message: 'Provide the full text of the announcement to be displayed'
    }
  ]);

  return answers;
}

module.exports = {
  promptToUser: promptToUser()
};
