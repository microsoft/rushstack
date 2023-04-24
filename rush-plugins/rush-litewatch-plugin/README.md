# @rushstack/rush-litewatch-plugin

An experimental alternative approach for multi-project watch mode.

The CLI mapping has not been implemented yet, but the usage will be like this:

```
# The user invokes this command
$ rush litewatch --project p1 --project p2
```

What happens:
- `heft build --watch` is launched in the project folder for `p1`
- `heft build --watch` is launched in the project folder for `p2`
- The console output from these two commands is printed in a single shell window
