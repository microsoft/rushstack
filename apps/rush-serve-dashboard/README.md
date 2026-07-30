# @rushstack/rush-serve-dashboard

This private package provides the browser dashboard for `@rushstack/rush-serve-plugin`. Its emitted ESM
assets are copied into the plugin package during the plugin build; it is not published independently.

The dashboard displays Rush operation state in table and graph views, exposes controls supported by the
plugin's WebSocket protocol, and shows operation logs. See the
[rush-serve-plugin documentation](../../rush-plugins/rush-serve-plugin/README.md#dashboard) for configuration
and usage.

## Development

From this folder, run `rushx start` to start the Heft development server or `rushx build` to build and test the
project. From the repository root, run `rush build --to @rushstack/rush-serve-plugin` to validate the dashboard
and the consuming plugin together.
