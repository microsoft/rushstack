export interface ITestOptions {
  paths: {
    sourceMatch: string[];
    include: string[];
    exclude: string[];
  };
}

export default {
  paths: {
    sourceMatch: ['src/**/*.js'],
    include: ['lib/**/*.test.js'],
    exclude: []
  }
};

