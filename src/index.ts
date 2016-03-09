import { KarmaTask } from './KarmaTask';

export const karma = new KarmaTask();
export default karma;

export const configResources = {
  bindPolyfillPath: require.resolve('phantomjs-polyfill/bind-polyfill.js'),
  istanbulInstrumenterLoaderPath: require.resolve('istanbul-instrumenter-loader'),
  plugins: [
    require('karma-webpack'),
    require('karma-mocha'),
    require('karma-coverage'),
    require('karma-mocha-clean-reporter'),
    require('karma-phantomjs-launcher'),
    require('karma-sinon-chai')
  ]
};