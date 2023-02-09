const child_process = require('child_process');
const https = require('https');

const buildRequestOptionsForGetUser = (username) => {
  if (!username) {
    throw new Error('Username is required');
  }

  const requestOptions = {
    host: 'api.github.com',
    path: `/users/${username}`,
    headers: {
      'User-Agent': '@microsoft/rushstack Codespaces Setup Script'
    }
  };

  return requestOptions;
};

const main = (username) => {
  const requestOptions = buildRequestOptionsForGetUser(username);
  const request = https.request(requestOptions, (response) => {
    let data = '';
    response.on('data', (chunk) => {
      data += chunk;
    });

    response.on('end', () => {
      const user = JSON.parse(data);
      const { name } = user;

      // Execute git config command
      console.log(`git config --local user.email "${username}@users.noreply.github.com"`);
      child_process.execSync(`git config --local user.email "${username}@users.noreply.github.com"`);

      console.log(`git config --local user.name "${name}"`);
      child_process.execSync(`git config --local user.name "${name}"`);
    });
  });

  request.end();
};

main(process.argv[2]);
