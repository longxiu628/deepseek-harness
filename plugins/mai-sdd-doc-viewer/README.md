# mai-sdd-doc-viewer

English | [中文](README.zh.md)

A read-only DSH Web right-Sidebar plugin that browses the SDD specification Markdown under the current Session workspace's `mai-specs` directory. Built for the `my-ai-infra` SDD course assignment.

## Features

- Adds an "SDD documents" page to the right Sidebar guide.
- Recursively lists lowercase `.md` files under `mai-specs/NNN-slug/` feature directories, with features before files and natural name order within each level.
- Features start expanded; deeper directories start collapsed. An empty feature explains itself.
- Selecting a document shows its full workspace-relative path and rendered content; documents with the same basename stay distinct by full path.
- Reload refreshes the tree and the selected document after external edits, additions, or deletions, and reports a deleted selection explicitly.
- Separate states cover no workspace, no `mai-specs`, no Markdown, read failure with retry, and a deleted selection.

## Constraints

- Read-only: calls only `remote.workspaceFiles.list` and `remote.workspaceFiles.read`; never `search`, and never writes a file.
- No subprocess: does not run `mai`, SDD commands, Git, or any other process.
- No model side effects: no LLM request, no API Key or credential read, no Session event, and no document path or content in prompts or tool arguments.
- No bundled sample documents; every entry comes from the current workspace.

## Files

| File | Purpose |
|---|---|
| `package.json` | Dynamic Host+Client manifest, icon, and bundle patch |
| `cordis.patch.yml` | Inserts the plugin into the DSH composition |
| `index.js` | Host companion with an empty `apply` |
| `client.js` | All browser behavior: registration, discovery, paged reads, state, and UI |
| `icon.svg` | Unofficial course plugin icon |
| `types.d.ts` | Minimal local declarations for React, client store, and UI primitives, used only by `checkJs` |
| `tsconfig.json` | `allowJs`, `checkJs`, `noEmit` |

## Checks

From the repository root:

```sh
node_modules/.bin/tsc -p plugins/mai-sdd-doc-viewer/tsconfig.json
```

`plugins/` is not a pnpm workspace package, and the repository root has no resolvable copy of `@deepseek-ai/dsh-client-store` or `@deepseek-ai/dsh-client-ui-primitives`. The type check therefore uses the minimal `types.d.ts` declarations: it covers this plugin's dictionary keys, component props, and store action signatures, not the internals of the reused packages.

Browser acceptance cases live in `mai-specs/999-mai-sdd-doc-viewer/test/TEST_PLAN.md`.
