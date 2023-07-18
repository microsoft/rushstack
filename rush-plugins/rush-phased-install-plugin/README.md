The @rushstack/rush-phased-install-plugin package is a demonstration of various optimizations to the package manager dependency installation process.
Notably:
1. Moving TAR integrity checking, decompression, parsing and unpacking off of the main thread
1. Specifically handling the authentication redirect pattern encountered in Azure DevOps Artifacts feeds
1. Tuning of network parameters for CI environments

To use the plugin, define in command-line.json a phased command called "phased-install", containing a single phase "_phase:prepare".
You will also need to install the plugin.