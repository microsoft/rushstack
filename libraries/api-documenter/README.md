# @microsoft/api-documenter

This is a code sample for [API Extractor](http://aka.ms/extractor), which creates a simple
online API reference manual for your TypeScript library.  It reads *.api.json data files
produced by API Extractor, and creates web pages using the
[Markdown](https://en.wikipedia.org/wiki/Markdown) file format.

This tool is part of Microsoft's production documentation pipeline.  It is provided
as a code sample to illustrate how to load and process the API JSON file format.  For simple
use cases, you can use this tool directly.  For more advanced needs, the tool does not
include an elaborate templating system.  Instead, developers are encouraged to fork the
project and modify the source code directly.  The implementation is intentionally kept
simple and easy to modify.  This is possible because most of processing is already
performed upstream by the API Extractor tool.
