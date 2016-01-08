export interface ITestOptions {
  frameworks: string[];
  paths: {
    sourceMatch: string[];
    include: string[];
    exclude: string[];
  };
}

export default {
  frameworks: ['mocha', 'sinon'],
  paths: {
    sourceMatch: ['src/**/*.js'],
    include: ['lib/tests.js'],
    exclude: []
  }
};

