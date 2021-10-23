# doc-plugin-docusaurus

An experimental API Documenter plugin, for generating Docusaurus-flavored markdown.

## Installation

In your `api-documenter.json`, add the plugin:

```json
{
  "outputTarget": "markdown",

  "plugins": [
    {
      "packageName": "doc-plugin-docusaurus",
      "enabledFeatureNames": ["docusaurus-markdown-documenter"]
    }
  ]
}
```

### Usage

Generate your documentation into a subfolder named `api`:

```console
api-documenter generate --input-folder ../../common/temp/api --output-folder ./dist/api
```

Copy the entire `api` folder into your Docusaurus `/docs` folder (as `/docs/api`).

Then, copy the generated `dist/api_nav.json` into the root of your Docusaurus project, and insert it into your sidebar wherever you would like:

```js
module.exports = {
  sidebar: [
    // ...
    require('./api_nav.json')
    // ...
  ]
};
```
