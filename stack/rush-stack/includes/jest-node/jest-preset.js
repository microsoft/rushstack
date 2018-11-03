

module.exports = {
  "verbose": true,

  "moduleFileExtensions": [
    "ts",
    "tsx",
    "js",
    "jsx"
  ],

  "transform": {
    "^.+\\.tsx?$": "ts-jest"
  },

  "testMatch": [
    "<rootDir>/src/**/*.test.ts"
  ],

  "globals": {
    "ts-jest": {
      "compiler": "<rootDir>/node_modules/@rush-stack-compiler"
    }
  }
};
