# @rushstack/mcp-server

With the rapid advancement of LLMs, AI applications like Trae, Cursor, Cline, Windsurf, and others have been thriving. However, due to the large scale of monorepos and the context limitations of LLMs, it’s difficult for these models to fully understand your monorepo. This is where @rushstack/mcp-server comes in — by providing a suite of MCP tools, it enables LLMs to better comprehend your monorepo and assist you more effectively with daily development tasks in a Rush-based monorepo environment.

## Usage

1. To get the best results, copy the [.cursor](https://github.com/microsoft/rushstack/tree/main/.cursor) directory into the root of your project.

2. Configure `@rushstack/mcp-server` in your AI application

```
{
  "mcpServers": {
    "rush": {
      "command": "npx",
      "args": ["-y", "@rushstack/mcp-server", "your-project-path"]
    }
  }
}
```

3. Congratulations 🎉 You’ve completed the setup — Rush MCP is now ready to use!

## Available Tools

- `rush_docs`: Retrieves relevant documentation sections based on your queries
- `rush_workspace_details`: Retrieve detailed workspace information
- `rush_project_details`: Get detailed information about a specific project
- `rush_command_validator`: Validate whether commands are compliant and follow best practices
- `rush_migrate_project`: Migrate a project from one directory to another or into a different subspace
- `rush_pnpm_lock_file_conflict_resolver`: Resolve pnpm-lock.yaml conflicts

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/apps/rush-mcp-server/CHANGELOG.md) - Find
  out what's new in the latest version
