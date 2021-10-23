# doc-plugin-jekyll

An experimental API Documenter plugin, for generating Jekyll-flavored markdown.

Currently used to generate the API documentation on [rushstack.io](https://rushstack.io).

## Installation

In your `api-documenter.json`, add the plugin:

```json
{
  "outputTarget": "markdown",

  "plugins": [
    {
      "packageName": "doc-plugin-jekyll",
      "enabledFeatureNames": ["jekyll-markdown-documenter"]
    }
  ]
}
```

### Usage

Generate your documentation into a subfolder named `api`:

```console
api-documenter generate --input-folder ../../common/temp/api --output-folder ./dist/api
```

Copy the entire `api` folder into your Jekyll `/pages` folder (as `/pages/api`).

Then, copy the generated `dist/api_nav.yaml` into the `/_data` folder.
