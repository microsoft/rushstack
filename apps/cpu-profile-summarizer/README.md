# @rushstack/cpu-profile-summarizer

> 🚨 _EARLY PREVIEW RELEASE_ 🚨
>
> Not all features are implemented yet. To provide suggestions, please
> [create a GitHub issue](https://github.com/microsoft/rushstack/issues/new/choose).
> If you have questions, see the [Rush Stack Help page](https://rushstack.io/pages/help/support/)
> for support resources.

The `cpu-profile-summarizer` command line tool helps you:

- Collate self/total CPU usage statistics for an entire monorepo worth of V8 .cpuprofile files

## Usage

It's recommended to install this package globally:

```
# Install the NPM package
npm install -g @rushstack/cpu-profile-summarizer

# Process a folder of cpuprofile files into a summary tsv file
cpu-profile-summarizer --input FOLDER --output FILE.tsv
```

The output file is in the tab-separated values (tsv) format.