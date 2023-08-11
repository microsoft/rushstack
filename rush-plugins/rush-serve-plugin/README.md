# @rushstack/rush-serve-plugin

A Rush plugin that hooks into action execution and runs an express server to serve project outputs. Meant for use with watch-mode commands.

Supports HTTP/2, compression, CORS, and the new Access-Control-Allow-Private-Network header.

```
# The user invokes this command
$ rush start
```

What happens:
- Rush scans for riggable `rush-serve.json` config files in all projects
- Rush uses the configuration in the aforementioned files to configure an Express server to serve project outputs as static (but not cached) content
- When a change happens to a source file, Rush's normal watch-mode machinery will rebuild all affected project phases, resulting in new files on disk
- The next time one of these files is requested, Rush will serve the new version. Optionally, may support signals for automatic refresh.
