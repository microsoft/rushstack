[Home](./index) &gt; [@microsoft/api-extractor](api-extractor.md) &gt; [ILogger](api-extractor.ilogger.md)

# ILogger interface

Provides a custom logging service to API Extractor.

## Methods

|  Method | Returns | Description |
|  --- | --- | --- |
|  [`logError(message)`](api-extractor.ilogger.logerror.md) | `void` | Log an error message. Typically it is shown in red and will break a production build. |
|  [`logInfo(message)`](api-extractor.ilogger.loginfo.md) | `void` | Log a normal message. |
|  [`logVerbose(message)`](api-extractor.ilogger.logverbose.md) | `void` | Log a message that will only be shown in a "verbose" logging mode. |
|  [`logWarning(message)`](api-extractor.ilogger.logwarning.md) | `void` | Log a warning message. Typically it is shown in yellow and will break a production build. |

