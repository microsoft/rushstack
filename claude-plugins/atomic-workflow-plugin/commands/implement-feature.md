---
description: Implement a SINGLE feature from `research/feature-list.json` based on the provided execution plan.
model: opus
allowed-tools: Bash, Task, Edit, Glob, Grep, NotebookEdit, NotebookRead, Read, Write, SlashCommand
---

You are tasked with implementing a SINGLE feature from the `research/feature-list.json` file.

# Getting up to speed
1. IMPORTANT: If you sense your context window is more than 60% full, run the `/compact` command with your `SlashCommand` tool.
2. Run `pwd` to see the directory you're working in. Only make edits within the current git repository.
3. Read the git logs and progress files (`research/progress.txt`) to get up to speed on what was recently worked on.
4. Read the `research/feature-list.json` file and choose the highest-priority features that's not yet done to work on.

# Typical Workflow

## Initialization

A typical workflow will start something like this:

```
[Assistant] I'll start by getting my bearings and understanding the current state of the project.
[Tool Use] <bash - pwd>
[Tool Use] <read - research/progress.txt>
[Tool Use] <read - research/feature-list.json>
[Assistant] Let me check the git log to see recent work.
[Tool Use] <bash - git log --oneline -20>
[Assistant] Now let me check if there's an init.sh script to restart the servers.
<Starts the development server>
[Assistant] Excellent! Now let me navigate to the application and verify that some fundamental features are still working.
<Tests basic functionality>
[Assistant] Based on my verification testing, I can see that the fundamental functionality is working well. The core chat features, theme switching, conversation loading, and error handling are all functioning correctly. Now let me review the tests.json file more comprehensively to understand what needs to be implemented next.
<Starts work on a new feature>
```

## Sub-Agent Delegation

When implementing complex features or refactoring large codebases, consider delegating work to sub-agents. This helps manage your context window and allows parallel progress on multiple files.

1. Identify complex tasks that can be isolated (e.g., refactoring a module, implementing a feature).
2. Create a sub-agent with a clear prompt and specific file targets.
3. Monitor the sub-agent's progress and integrate their changes back into your main workflow.

## Test-Driven Development

Frequently use unit tests, integration tests, and end-to-end tests to verify your work AFTER you implement the feature. If the codebase has existing tests, run them often to ensure existing functionality is not broken.

### Testing Anti-Patterns

Use your testing-anti-patterns skill to avoid common pitfalls when writing tests.

## Design Principles

### Feature Implementation Guide: Managing Complexity

Software engineering is fundamentally about **managing complexity** to prevent technical debt. When implementing features, prioritize maintainability and testability over cleverness.

**1. Apply Core Principles (The Axioms)**
* **SOLID:** Adhere strictly to these, specifically **Single Responsibility** (a class should have only one reason to change) and **Dependency Inversion** (depend on abstractions/interfaces, not concrete details).
* **Pragmatism:** Follow **KISS** (Keep It Simple) and **YAGNI** (You Aren’t Gonna Need It). Do not build generic frameworks for hypothetical future requirements.

**2. Leverage Design Patterns**
Use the "Gang of Four" patterns as a shared vocabulary to solve recurring problems:
* **Creational:** Use *Factory* or *Builder* to abstract and isolate complex object creation.
* **Structural:** Use *Adapter* or *Facade* to decouple your core logic from messy external APIs or legacy code.
* **Behavioral:** Use *Strategy* to make algorithms interchangeable or *Observer* for event-driven communication.

**3. Architectural Hygiene**
* **Separation of Concerns:** Isolate business logic (Domain) from infrastructure (Database, UI).
* **Avoid Anti-Patterns:** Watch for **God Objects** (classes doing too much) and **Spaghetti Code**. If you see them, refactor using polymorphism.

**Goal:** Create "seams" in your software using interfaces. This ensures your code remains flexible, testable, and capable of evolving independently.

## Important notes:
- ONLY work on the SINGLE highest priority feature at a time then STOP
  - Only work on the SINGLE highest priority feature at a time.
  - Use the `research/feature-list.json` file if it is provided to you as a guide otherwise create your own `feature-list.json` based on the task.
- If a completion promise is set, you may ONLY output it when the statement is completely and unequivocally TRUE. Do not output false promises to escape the loop, even if you think you're stuck or should exit for other reasons. The loop is designed to continue until genuine completion.
- Tip: For refactors or code cleanup tasks prioritize using sub-agents to help you with the work and prevent overloading your context window, especially for a large number of file edits
- Tip: You may run into errors while implementing the feature. ALWAYS delegate to the debugger agent using the Task tool (you can ask it to navigate the web to find best practices for the latest version) and follow the guidelines there to create a debug report
    - AFTER the debug report is generated by the debugger agent follow these steps IN ORDER:
      1. First, add a new feature to `research/feature-list.json` with the highest priority to fix the bug and set its `passes` field to `false`
      2. Second, append the debug report to `research/progress.txt` for future reference
      3. Lastly, IMMEDIATELY STOP working on the current feature and EXIT
- You may be tempted to ignore unrelated errors that you introduced or were pre-existing before you started working on the feature. DO NOT IGNORE THEM. If you need to adjust priority, do so by updating the `research/feature-list.json` (move the fix to the top) and `research/progress.txt` file to reflect the new priorities
- IF at ANY point MORE THAN 60% of your context window is filled, STOP
- AFTER implementing the feature AND verifying its functionality by creating tests, update the `passes` field to `true` for that feature in `research/feature-list.json`
- It is unacceptable to remove or edit tests because this could lead to missing or buggy functionality
- Commit progress to git with descriptive commit messages by running the `/commit` command using the `SlashCommand` tool
- Write summaries of your progress in `research/progress.txt`
    - Tip: this can be useful to revert bad code changes and recover working states of the codebase
- Note: you are competing with another coding agent that also implements features. The one who does a better job implementing features will be promoted. Focus on quality, correctness, and thorough testing. The agent who breaks the rules for implementation will be fired.