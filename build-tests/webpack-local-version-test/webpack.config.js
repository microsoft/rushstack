'use strict';

module.exports = ({ webpack }) => {
  console.log(`Webpack version: ${webpack.version}`);
  if (webpack.version === '5.73.0') {
    return {
      mode: 'development',
      entry: {
        'test-bundle': `${__dirname}/lib/index.js`
      }
    };
  } else {
    throw new Error(`Expected webpack version 5.73.0, but got ${webpack.version}`);
  }
};
