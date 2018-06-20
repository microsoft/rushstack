# rushell

NodeJS provides APIs for executing shell commands, however *which* shell invokes these commands depends on your OS.  There is no universal shell interpreter that is guaranteed to be installed on every PC with Linux, Mac, or Windows.

Unfortunately each shell has its own opinions about:
- Which characters are "special" and need to be escaped?
- How do you escape a special character?
- Is "/" or "\" the path separator?
- What's the syntax for substituting an environment variable?

The Rushell library provides a minimal subset of a POSIX-compatible shell, implemented in pure JavaScript, and guaranteed to behave consistently on every platform.  Rushell does not aim to be an interactive command prompt or Turing-complete language.  It's merely a reliable cross-platform solution for very basic needs such as:

- Invoke a tool with command-line arguments
- Reliably quote special symbols
- Chain multiple commands using `&&` or `||`
- Use `cd` to change the current working directory
- Expand environment variables

(These are the requirements that [Rush](https://rushjs.io) had when invoking lifecycle `scripts` from a package.json file.)

## Syntax

Invoking a script using Rushell should generally provide similar output as [dash](https://en.wikipedia.org/wiki/Almquist_shell).  Only a small subset of POSIX shell features are supported.  More can be added over time, although the overall aim is to remain simplistic, lightweight, and self-contained (i.e. no dependencies on other libraries).

Example shell scripts:

`echo "Hello, world"` - print a string containing a space
