# Runtime CLI Tab Titles Design

## Problem

Local terminal titles currently use the deepest Windows process-tree executable. That works for native programs, but npm-installed command-line apps commonly run as `node.exe`. As a result, unrelated applications such as Claude and Pi both appear as `node` even though the process command line identifies a different JavaScript entry point.

`@vscode/windows-process-tree` can return each process command line when `ProcessDataFlag.CommandLine` (`2`) is requested. HyperShell currently calls the API without that flag and discards the information needed to distinguish runtime-hosted applications.

## Goals

- Show the actual npm CLI bin name for Node-hosted terminal applications, including `claude` and `pi`.
- Resolve applications generically from installed package metadata rather than maintaining an application allowlist.
- Preserve existing behavior for native executables, shells, remote relay clients, missing process trees, and unresolvable Node commands.
- Avoid repeated filesystem work in the one-second process-title poller.

## Non-goals

- Guess friendly marketing names or apply title casing.
- Inspect remote processes hidden behind SSH, mosh, plink, or telnet.
- Resolve arbitrary Python, Java, or other runtime entry points in this change.
- Send process command lines across IPC or expose them to the renderer.

## Design

### Command-line collection

The Windows process-tree adapter will request command-line data by passing flag `2` to `getProcessTree`. Its private raw-node shape gains `commandLine?: string`, while the public `ProcessNode` gains only `displayName?: string`. Raw command lines remain inside `session-core` and are never emitted as session events.

### Generic Node CLI resolution

A focused `nodeCliName.ts` module will create a cached resolver. For a deepest process named `node` or `node.exe`, it will:

1. Tokenize the Windows command line and locate the first JavaScript entry-point argument (`.js`, `.cjs`, or `.mjs`).
2. Walk upward from that script to find package manifests.
3. Compare the script's normalized path with each manifest's `bin` target.
4. Return the matching bin key, such as `claude` or `pi`. If `bin` is a string, use the package's unscoped name, following npm's bin convention.
5. Cache both successful and unsuccessful results by normalized script path.

Malformed, truncated, inaccessible, or non-package command lines return `null`. The existing executable title (`node`) remains the fallback.

The resolver accepts injected filesystem operations in tests. Production uses synchronous reads only on the first sighting of an entry-point path; subsequent one-second polls are cache hits.

### Foreground title selection

The Windows adapter assigns the resolver result to `ProcessNode.displayName`. `pickForegroundName` continues to choose the deepest process and apply the existing shell and passthrough filters, then prefers `displayName` over the stripped executable name. The poller, IPC event, renderer store, and title-resolution order remain unchanged.

## Error handling and security

- All command-line parsing and manifest failures degrade to the existing executable title.
- Invalid JSON, missing files, path mismatches, and unexpected manifest shapes are ignored.
- A manifest bin name is accepted only when its target resolves to the exact entry script from the process command line.
- No command-line arguments or package paths leave the main process.

## Testing

- Unit-test Node command-line parsing and package-bin matching for Claude and Pi layouts.
- Cover quoted paths, scoped packages, string-form `bin`, invalid manifests, mismatched targets, truncated input, and negative caching.
- Verify the Windows adapter requests flag `2` and maps a resolved display name without exposing raw command lines.
- Verify foreground selection prefers a resolved CLI name while retaining `node` as the fallback.
- Run focused process-title tests, the complete `session-core` suite, TypeScript build, and repository unit tests as verification allows.
