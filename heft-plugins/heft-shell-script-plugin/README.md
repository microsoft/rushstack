# @rushstack/heft-shell-script-plugin

This is a Heft plugin to run shell scripts within your project.

## Usage

You can see the plugin schema [here](./src/schemas/heft-shell-script-plugin.schema.json).  For each shell script you would like to run, you give the plugin a shell command you would like to run via the `command` argument, and what build stage you would like to run the command in via the `stage` argument.  You can also give the plugin either a separate command to run in watch mode via the `watchCommand` argument (which i.e. might be the same as your `command` argument with --watch appended depending on the tool you're using) or a list of globs to watch via the `watchGlobs` argument if the tool you're using doesn't have a native watch mode.

The plugin includes `./node_modules/.bin` on the PATH when launching the shell command, so you can simply pass the name of a node-based tool that you have installed via your `package.json`.

An example heft.json wrapping protoc:
```json
{
    "$schema": "https://developer.microsoft.com/json-schemas/heft/heft.schema.json",
    "extends": "../node_modules/@rushstack/heft-node-rig/profiles/default/config/heft.json",
    "heftPlugins": [
        {
            "plugin": "@rushstack/heft-shell-script-plugin",
            "options": {
                "scripts": [
                    {
                        "name": "grpc-codegen",
                        "stage": "pre-compile",
                        "command": "mkdir -p ./src/__generated__/proto && protoc --plugin=./node_modules/.bin/protoc-gen-ts_proto --ts_proto_opt=env=node,outputServices=grpc-js,esModuleInterop=true --ts_proto_out=./src/__generated__/proto --proto_path=./src/proto $(find ./src/proto -iname '*.proto')",
                        "watchGlobs": ["./src/proto/*.proto"]
                    }
                ]
            }
        }
    ]
}
```

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/heft-plugins/heft-dev-cert-plugin/CHANGELOG.md) - Find
  out what's new in the latest version

Heft is part of the [Rush Stack](https://rushstack.io/) family of projects.
