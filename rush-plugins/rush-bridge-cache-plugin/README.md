# @rushstack/rush-bridge-cache-plugin

This plugin allows for interaction with the Rush cache. It exposes some methods to set the cache.


## Installation

`npm install @rushstack/rush-bridge-cache-plugin`

<!--
## Usage
The package contains a binary you can run from the command line. It will auto-detect the location of your rush.json file.

`populate-rush-cache --packageName=[package name] --phase=test:unit`

- `--packageName` (required) - this should map to the `packageName` entry in your `rush.json` file.
- `--phase` (required): the name of the phased command whose command has already been ran, and you want to cache the result on disk.
-->

--------------------

So this will:
- tap into the hooks and do all the necessary shit to figure out how to po
- expose a simple API for external users to tap into, e.g. if you want to populate the cache externally you'd import this plugin and use the methods to do so. You could then wrap that in a rush function, or however you want to do it.





--------------------

Discussion about the solution for BuildXL here:
  https://teams.microsoft.com/l/message/19:d85f52548ec74e8f8a0f107bd4e5ceb6@thread.v2/1740610046597?context=%7B%22contextType%22%3A%22chat%22%7D


"populate-cache": "..." <--- called after any cacheable unit of work is complete

OperationExecutionRecord -> the smallest unit of work to be done.
  - looks like it's strongly coupled to the runner. We need one-off method calls.

CacheableOperationPlugin
  _tryGetProjectBuildCache()  -> this returns the project build cache


