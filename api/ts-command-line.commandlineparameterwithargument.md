[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineParameterWithArgument](./ts-command-line.commandlineparameterwithargument.md)

# CommandLineParameterWithArgument class

The common base class for parameters types that receive an argument.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`argumentName`](./ts-command-line.commandlineparameterwithargument.argumentname.md) |  | `string` | The name of the argument, which will be shown in the command-line help. |

## Remarks

The constructor for this class is marked as internal. Third-party code should not call the constructor directly or create subclasses that extend the CommandLineParameterWithArgument class.

An argument is an accompanying command-line token, such as "123" in the example "--max-count 123".
