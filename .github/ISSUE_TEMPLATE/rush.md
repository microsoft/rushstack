---
name: 'Rush'
about: Report an issue with the '@microsoft/rush' project and associated packages
title: '[rush] '
labels: ''
assignees: ''
---

<!-- Have a question?  Before creating an issue, ask in the chat room: https://rushstack.zulipchat.com/ -->

<!-- Try invoking Rush with the "--debug" parameter, for example "rush --debug install".  This prints a full call stack when errors occur. -->

<!--------------------------------------------------------------------------
👉 STEP 1: Write a concise but specific issue title in the box above.
     Example: "[rush] Using --example switch causes TypeError"
--------------------------------------------------------------------------->

## Summary

<!--------------------------------------------------------------------------
👉 STEP 2: In a few sentences, please explain:

     What were you trying to accomplish?
     What action did you perform that ran into trouble?
     What went wrong?
--------------------------------------------------------------------------->

## Repro steps

<!--------------------------------------------------------------------------
👉 STEP 3: If your issue is a feature request and not a bug, delete this
     "Repro steps" section and skip to STEP 6.

👉 STEP 4: In many cases we can investigate bugs much faster if you include:
     The URL for a simplified Git branch that reproduces the problem.
     Step by step instructions for how to build the branch and see the error.

👉 STEP 5: It's also helpful to include an "expected" and "actual" result.
     But if that's not relevant, feel free to delete those fields.
--------------------------------------------------------------------------->

  **Expected result:** <!-- What you expected these steps to accomplish -->

  **Actual result:** <!-- If an error occurred, include the full error message text and any call stack. -->

## Details

<!--------------------------------------------------------------------------
👉 STEP 6: Provide any additional information you think might be helpful:

     What do you think is the cause of this problem?
     How do you think we should fix this?
--------------------------------------------------------------------------->

## Standard questions

Please answer these questions to help us investigate your issue more quickly:

| Question | Answer |
| -------- | -------- |
| `@microsoft/rush` globally installed version? | <!-- X.Y.Z --> |
| `rushVersion` from rush.json? | <!-- X.Y.Z --> |
| `pnpmVersion`, `npmVersion`, or `yarnVersion` from rush.json? | <!-- pnpm@X.Y.Z --> |
| (if pnpm) `useWorkspaces` from pnpm-config.json? | <!-- X.Y.Z --> |
| Operating system? | <!-- Windows / Mac / Linux --> |
| Would you consider contributing a PR? | <!-- Yes / No --> |
| Node.js version (`node -v`)? | <!-- X.Y.Z --> |
