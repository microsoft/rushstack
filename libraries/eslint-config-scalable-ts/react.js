module.exports = {
  plugins: [
    "eslint-plugin-react"
  ],

  settings: {
    react: {
      "version": "detect"
    }
  },

  overrides: [
    {
      // Declare an override that applies to TypeScript files only
      "files": [ "*.ts", "*.tsx" ],

      rules: {
        // RATIONALE:         When React components are added to an array, they generally need a "key".
        "react/jsx-key": "error",

        // RATIONALE:         Catches a common coding practice that significantly impacts performance.
        "react/jsx-no-bind": "error",

        // RATIONALE:         Catches a common coding mistake.
        "react/jsx-no-comment-textnodes": "error",

        // RATIONALE:         Security risk.
        "react/jsx-no-target-blank": "error",

        // RATIONALE:         Catches a common coding mistake.
        "react/no-children-prop": "error",

        // RATIONALE:         Catches a common coding mistake.
        "react/no-danger-with-children": "error",

        // RATIONALE:         Catches a common coding mistake.
        "react/no-direct-mutation-state": "error",

        // RATIONALE:         Avoids a potential performance problem.
        "react/no-find-dom-node": "error",

        // RATIONALE:         Deprecated API.
        "react/no-is-mounted": "error",

        // RATIONALE:         Deprecated API.
        "react/no-render-return-value": "error",

        // RATIONALE:         Deprecated API.
        "react/no-string-refs": "error",
      }
    }
  ]
};
