// @ts-check
/**
 * SDD document viewer: a read-only right-Sidebar page that lists the Markdown
 * artifacts under the current Session workspace's `mai-specs` directory.
 *
 * The plugin runs entirely in the browser. It reads through
 * `remote.workspaceFiles.list` and `remote.workspaceFiles.read` only: no search,
 * no subprocess, no file writes, no LLM request, no credential access, and no
 * Session event. The Host half (`index.js`) is an empty companion so the package
 * loads as a complete dynamic Host+Client plugin.
 *
 * @module @local/mai-sdd-doc-viewer/client
 */

// Classic scripts share one global lexical scope across a boot batch and its
// one-resource fallback; an IIFE keeps these bindings re-execution-safe.
;(() => {
const PLUGIN_ID = '@local/mai-sdd-doc-viewer'
const NS = 'maiSddDocViewer'
const KIND = 'mai-sdd-documents'
const ROOT = 'mai-specs'
const FEATURE_PATTERN = /^\d{3}-.+$/
const COLLATOR = new Intl.Collator('en', { numeric: true })

/**
 * A failure that the UI can explain with a localized state message.
 * @typedef {{ readonly reason: 'remote' | 'incomplete' | 'invalid' | 'exception', readonly code: string }} SddFailure
 */

/**
 * @typedef {{ readonly name: string, readonly path: string }} SddDocument
 */

/**
 * @typedef {{
 *   readonly name: string,
 *   readonly path: string,
 *   readonly kind: 'feature' | 'directory',
 *   readonly directories: SddDirectory[],
 *   readonly documents: SddDocument[],
 * }} SddDirectory
 */

/**
 * @typedef {'idle' | 'loading' | 'ready' | 'no-workspace' | 'missing-root' | 'error'} TreeStatus
 */

/**
 * @typedef {{
 *   readonly status: 'idle' | 'loading' | 'ready' | 'error' | 'missing',
 *   readonly path?: string,
 *   readonly text?: string,
 *   readonly version?: string,
 *   readonly failure?: SddFailure,
 * }} DocumentState
 */

/**
 * @typedef {{
 *   cwd?: string,
 *   treeStatus: TreeStatus,
 *   treeFailure?: SddFailure,
 *   features?: readonly SddDirectory[],
 *   selectedPath?: string,
 *   expanded: Record<string, boolean>,
 *   document: DocumentState,
 * }} SddTabState
 */

/**
 * @typedef {{ byTab: Record<string, SddTabState> }} SddState
 */

/** Simplified Chinese copy; this key set is the dictionary's source of truth. */
const zh = {
  title: 'SDD 文档',
  reload: '重新读取',
  loading: '正在读取 SDD 文档...',
  noWorkspace: '请先打开一个包含 mai-specs 的工作区。',
  missingRoot: '当前工作区未找到 mai-specs 目录。',
  empty: '未找到可预览的 Markdown 文档。',
  selectDocument: '请选择一篇 Markdown 文档。',
  readFailed: 'SDD 文档读取失败，请重试。',
  retry: '重试',
  missingDocument: '所选文档已不存在，请重新选择。',
  guideDescription: '按 Feature 浏览 SDD Markdown 规格文档',
  treeLabel: '文档树',
  previewLabel: '文档预览',
  codeCopy: '复制代码',
  codeCopied: '已复制',
  codeTitle: '代码块',
  codeWrap: '自动换行',
  codeUnwrap: '不换行',
  footnotes: '脚注',
}

/** @type {Record<keyof typeof zh, string>} */
const en = {
  title: 'SDD documents',
  reload: 'Reload',
  loading: 'Loading SDD documents...',
  noWorkspace: 'Open a workspace that contains mai-specs first.',
  missingRoot: 'No mai-specs directory was found in this workspace.',
  empty: 'No Markdown documents were found.',
  selectDocument: 'Select a Markdown document.',
  readFailed: 'Failed to read the SDD documents. Try again.',
  retry: 'Retry',
  missingDocument: 'The selected document no longer exists. Select another document.',
  guideDescription: 'Browse SDD Markdown specifications by feature',
  treeLabel: 'Document tree',
  previewLabel: 'Document preview',
  codeCopy: 'Copy code',
  codeCopied: 'Copied',
  codeTitle: 'Code block',
  codeWrap: 'Wrap lines',
  codeUnwrap: 'Do not wrap',
  footnotes: 'Footnotes',
}

const scopedStyles = `
[data-mai-sdd-doc-viewer] {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  container-type: inline-size;
  color: inherit;
}
[data-mai-sdd-doc-viewer] .header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-1, rgba(127, 127, 127, 0.22));
}
[data-mai-sdd-doc-viewer] .title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
[data-mai-sdd-doc-viewer] .iconButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
[data-mai-sdd-doc-viewer] .iconButton:disabled {
  cursor: default;
  opacity: 0.5;
}
[data-mai-sdd-doc-viewer] .iconButton:focus-visible,
[data-mai-sdd-doc-viewer] .navButton:focus-visible,
[data-mai-sdd-doc-viewer] .textButton:focus-visible,
[data-mai-sdd-doc-viewer] .node:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: -2px;
}
[data-mai-sdd-doc-viewer] .nav {
  display: none;
  gap: 6px;
  padding: 6px 8px 0;
}
[data-mai-sdd-doc-viewer] .navButton,
[data-mai-sdd-doc-viewer] .textButton {
  padding: 3px 8px;
  border: 1px solid var(--dsw-alias-border-1, rgba(127, 127, 127, 0.32));
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
[data-mai-sdd-doc-viewer] .layout {
  display: grid;
  grid-template-columns: minmax(0, 13.75rem) minmax(0, 1fr);
  gap: 8px;
  flex: 1;
  min-height: 0;
  padding: 8px;
}
[data-mai-sdd-doc-viewer] .pane {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  border-radius: 4px;
}
[data-mai-sdd-doc-viewer] .pane:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: -2px;
}
[data-mai-sdd-doc-viewer] .tree {
  list-style: none;
  margin: 0;
  padding: 0 0 0 10px;
}
[data-mai-sdd-doc-viewer] .tree:first-child {
  padding-left: 0;
}
[data-mai-sdd-doc-viewer] .node {
  display: flex;
  align-items: center;
  gap: 2px;
  width: 100%;
  padding: 2px 4px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-mai-sdd-doc-viewer] .node[aria-current='page'] {
  font-weight: 600;
  background: var(--dsw-alias-bg-2, rgba(127, 127, 127, 0.14));
}
[data-mai-sdd-doc-viewer] .chevron {
  flex: none;
  width: 1em;
}
[data-mai-sdd-doc-viewer] .hint {
  padding: 2px 4px 2px 1.5em;
  opacity: 0.72;
  font-size: 0.9em;
}
[data-mai-sdd-doc-viewer] .status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 4px;
  opacity: 0.85;
}
[data-mai-sdd-doc-viewer] .status[role='alert'] {
  display: block;
  opacity: 1;
}
[data-mai-sdd-doc-viewer] .status p {
  margin: 0 0 6px;
}
[data-mai-sdd-doc-viewer] .spinner {
  width: 12px;
  height: 12px;
  flex: none;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: mai-sdd-spin 0.9s linear infinite;
}
@keyframes mai-sdd-spin {
  to { transform: rotate(360deg); }
}
[data-mai-sdd-doc-viewer] .path {
  padding: 2px 0 8px;
  font-size: 12px;
  opacity: 0.75;
  word-break: break-all;
}
[data-mai-sdd-doc-viewer] .notice {
  padding: 4px 0;
  font-size: 0.92em;
  opacity: 0.85;
}
@container (max-width: 32.5rem) {
  [data-mai-sdd-doc-viewer] .nav {
    display: flex;
  }
  [data-mai-sdd-doc-viewer] .layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-mai-sdd-doc-viewer] .spinner {
    animation: none;
  }
}
`

/**
 * Read the projected working directory of one Session, inlined because the
 * source helper documents that Client plugins must copy it.
 * @param {any} state
 * @param {string} sessionId
 * @returns {string | undefined}
 */
function selectSessionDirectory(state, sessionId) {
  const session = state?.byId?.[sessionId]
  /** @param {any} values */
  const projected = values => {
    if (values === undefined || values === null) return undefined
    const value = Reflect.get(values, 'workingDirectory')
    return typeof value === 'string' ? value : undefined
  }
  return projected(state?.projectionsBySession?.[sessionId]?.values)
    ?? projected(session?.projectionValues)
    ?? (typeof session?.cwd === 'string' ? session.cwd : undefined)
}

/**
 * @param {SddFailure['reason']} reason
 * @param {string} code
 * @returns {SddFailure}
 */
const failure = (reason, code) => ({ reason, code })

/**
 * @template T
 * @param {T} value
 * @returns {{ ok: true, value: T }}
 */
const ok = value => ({ ok: true, value })

/** @param {SddFailure} value */
const fail = value => ({ ok: false, failure: value })

/**
 * @param {unknown} error
 * @returns {string}
 */
function remoteCode(error) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = Reflect.get(error, 'code')
    if (typeof code === 'string') return code
  }
  return 'workspace-file/unknown'
}

/**
 * @param {string} path
 * @returns {boolean}
 */
function isSddDocumentPath(path) {
  if (!path.endsWith('.md')) return false
  const segments = path.split('/')
  if (segments.length < 3) return false
  if (segments[0] !== ROOT) return false
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') return false
  }
  return FEATURE_PATTERN.test(segments[1])
}

/**
 * @param {string} parent
 * @param {string} name
 * @returns {string}
 */
function childPath(parent, name) {
  if (name === '' || name === '.' || name === '..' || name.includes('/') || name.includes('\\') || name.includes('\0')) {
    throw new Error(`mai-sdd-doc-viewer: invalid directory entry name ${JSON.stringify(name)}`)
  }
  return `${parent}/${name}`
}

/**
 * @param {number} left
 * @param {number} right
 * @returns {number}
 */
function compareNumber(left, right) {
  return left - right
}

/**
 * @param {{ readonly name: string }} left
 * @param {{ readonly name: string }} right
 * @returns {number}
 */
function compareName(left, right) {
  const primary = COLLATOR.compare(left.name, right.name)
  if (primary !== 0) return primary
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0
}

/**
 * @param {any} list
 * @param {string} sessionId
 * @param {string} path
 * @param {AbortSignal} signal
 * @returns {Promise<any>}
 */
async function listExact(list, sessionId, path, signal) {
  const result = await list(sessionId, path, signal)
  if (result.ok !== true) return fail(failure('remote', remoteCode(result.error)))
  const listing = result.value
  if (listing.truncated === true) return fail(failure('incomplete', 'mai-sdd/truncated-directory'))
  if (listing.path !== path) return fail(failure('incomplete', 'mai-sdd/resolved-directory'))
  for (const entry of listing.entries) childPath(path, entry.name)
  return ok(listing.entries)
}

/**
 * @param {SddDirectory} feature
 * @returns {SddDirectory}
 */
function sortFeature(feature) {
  feature.directories.sort(compareName)
  feature.documents.sort(compareName)
  for (const directory of feature.directories) sortFeature(directory)
  return feature
}

/**
 * @param {{ readonly name: string, readonly path: string, readonly documents: SddDocument[] }} source
 * @returns {SddDirectory}
 */
function buildFeature(source) {
  /** @type {SddDirectory} */
  const root = { name: source.name, path: source.path, kind: 'feature', directories: [], documents: [] }
  for (const document of source.documents) {
    const parts = document.path.slice(source.path.length + 1).split('/')
    let node = root
    for (const part of parts.slice(0, -1)) {
      let next = node.directories.find(directory => directory.name === part)
      if (next === undefined) {
        next = { name: part, path: `${node.path}/${part}`, kind: 'directory', directories: [], documents: [] }
        node.directories.push(next)
      }
      node = next
    }
    node.documents.push(document)
  }
  return sortFeature(root)
}

/**
 * Discover the fixed tree and return either the features or a missing-root flag.
 * @param {any} list
 * @param {string} sessionId
 * @param {AbortSignal} signal
 * @returns {Promise<any>}
 */
async function discoverTree(list, sessionId, signal) {
  const root = await listExact(list, sessionId, ROOT, signal)
  if (!root.ok) {
    const code = root.failure.code
    if (root.failure.reason === 'remote' && (code === 'workspace-file/not-found' || code === 'workspace-file/not-directory')) {
      return ok({ missingRoot: true, features: [] })
    }
    return root
  }
  const features = []
  for (const entry of root.value) {
    if (entry.type !== 'directory' || !FEATURE_PATTERN.test(entry.name)) continue
    const path = childPath(ROOT, entry.name)
    /** @type {SddDocument[]} */
    const documents = []
    const visited = new Set()
    /** @param {string} directory @returns {Promise<any>} */
    const walk = async directory => {
      if (visited.has(directory)) return fail(failure('incomplete', 'mai-sdd/directory-cycle'))
      visited.add(directory)
      const listed = await listExact(list, sessionId, directory, signal)
      if (!listed.ok) return listed
      for (const child of listed.value) {
        const childFullPath = childPath(directory, child.name)
        if (child.type === 'directory') {
          const walked = await walk(childFullPath)
          if (!walked.ok) return walked
        } else if (child.type === 'file' && child.name.endsWith('.md')) {
          documents.push({ name: child.name, path: childFullPath })
        }
      }
      return ok(undefined)
    }
    const walked = await walk(path)
    if (!walked.ok) return walked
    features.push({ name: entry.name, path, documents })
  }
  return ok({ missingRoot: false, features: features.map(buildFeature).sort(compareName) })
}

/**
 * Read the whole document page by page and reject mixed versions.
 * @param {any} read
 * @param {string} sessionId
 * @param {string} path
 * @param {AbortSignal} signal
 * @returns {Promise<any>}
 */
async function readWholeDocument(read, sessionId, path, signal) {
  if (!isSddDocumentPath(path)) return fail(failure('invalid', 'mai-sdd/invalid-path'))
  const parts = []
  let version = ''
  let offset = 1
  for (;;) {
    const result = await read(sessionId, path, { offset }, signal)
    if (result.ok !== true) return fail(failure('remote', remoteCode(result.error)))
    const page = result.value
    if (version === '') version = page.version
    else if (page.version !== version) return fail(failure('incomplete', 'mai-sdd/version-changed'))
    if (!Number.isSafeInteger(page.lines) || page.lines < 0) return fail(failure('invalid', 'mai-sdd/invalid-page'))
    if (page.lines > 0) parts.push(page.text)
    if (page.eof === true) return ok({ text: parts.join('\n'), version })
    if (page.lines === 0) return fail(failure('invalid', 'mai-sdd/no-progress'))
    offset += page.lines
    if (offset > Number.MAX_SAFE_INTEGER / 2) return fail(failure('invalid', 'mai-sdd/offset-overflow'))
  }
}

/**
 * @param {readonly SddDirectory[] | undefined} features
 * @param {string} path
 * @returns {SddDocument | undefined}
 */
function findDocument(features, path) {
  if (features === undefined) return undefined
  /** @param {SddDirectory} node @returns {SddDocument | undefined} */
  const walk = node => {
    for (const document of node.documents) {
      if (document.path === path) return document
    }
    for (const directory of node.directories) {
      const found = walk(directory)
      if (found !== undefined) return found
    }
    return undefined
  }
  for (const feature of features) {
    const found = walk(feature)
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * @param {SddDirectory} node
 * @param {Set<string>} target
 * @returns {void}
 */
function collectDirectories(node, target) {
  target.add(node.path)
  for (const directory of node.directories) collectDirectories(directory, target)
}

/**
 * @param {string} path
 * @returns {boolean}
 */
function isFeaturePath(path) {
  return path.split('/').length === 2
}

/**
 * @param {DocumentState} document
 * @param {string} path
 * @returns {{ text?: string, version?: string }}
 */
function previousContent(document, path) {
  if (document.path !== path) return {}
  return { text: document.text, version: document.version }
}

/**
 * @param {SddState} state
 * @param {string} tabId
 * @returns {SddTabState}
 */
function currentRecord(state, tabId) {
  return state.byTab[tabId] ?? { treeStatus: 'idle', expanded: {}, document: { status: 'idle' } }
}

/**
 * Substitute a tab's record so subscribers observe the change; mutating a
 * record in place keeps the selected value identical and skips re-rendering.
 * @param {SddState} state
 * @param {string} tabId
 * @param {SddTabState} record
 * @returns {void}
 */
function putRecord(state, tabId, record) {
  state.byTab = { ...state.byTab, [tabId]: record }
}

const storeActions = {
  /**
   * @param {SddState} state
   * @param {string} tabId
   * @param {string} cwd
   */
  visited(state, tabId, cwd) {
    putRecord(state, tabId, { cwd, treeStatus: 'loading', expanded: {}, document: { status: 'idle' } })
  },
  /** @param {SddState} state @param {string} tabId */
  treeLoading(state, tabId) {
    putRecord(state, tabId, { ...currentRecord(state, tabId), treeStatus: 'loading' })
  },
  /** @param {SddState} state @param {string} tabId @param {readonly SddDirectory[]} features */
  treeReady(state, tabId, features) {
    const record = currentRecord(state, tabId)
    const allowed = new Set()
    for (const feature of features) collectDirectories(feature, allowed)
    putRecord(state, tabId, {
      ...record,
      treeStatus: 'ready',
      treeFailure: undefined,
      features,
      expanded: Object.fromEntries(Object.entries(record.expanded).filter(([path]) => allowed.has(path))),
    })
  },
  /** @param {SddState} state @param {string} tabId */
  treeMissingRoot(state, tabId) {
    putRecord(state, tabId, {
      ...currentRecord(state, tabId),
      treeStatus: 'missing-root',
      treeFailure: undefined,
      features: undefined,
      selectedPath: undefined,
      expanded: {},
      document: { status: 'idle' },
    })
  },
  /** @param {SddState} state @param {string} tabId @param {SddFailure} value */
  treeFailed(state, tabId, value) {
    putRecord(state, tabId, { ...currentRecord(state, tabId), treeStatus: 'error', treeFailure: value })
  },
  /** @param {SddState} state @param {string} tabId */
  noWorkspace(state, tabId) {
    putRecord(state, tabId, {
      ...currentRecord(state, tabId),
      cwd: undefined,
      treeStatus: 'no-workspace',
      treeFailure: undefined,
      features: undefined,
      selectedPath: undefined,
      expanded: {},
      document: { status: 'idle' },
    })
  },
  /** @param {SddState} state @param {string} tabId @param {string} path */
  toggled(state, tabId, path) {
    const record = currentRecord(state, tabId)
    const current = record.expanded[path]
    putRecord(state, tabId, {
      ...record,
      expanded: { ...record.expanded, [path]: !(current ?? isFeaturePath(path)) },
    })
  },
  /** @param {SddState} state @param {string} tabId @param {string} path */
  selected(state, tabId, path) {
    const record = currentRecord(state, tabId)
    putRecord(state, tabId, {
      ...record,
      selectedPath: path,
      document: { status: 'loading', path, ...previousContent(record.document, path) },
    })
  },
  /** @param {SddState} state @param {string} tabId @param {string} path */
  documentLoading(state, tabId, path) {
    const record = currentRecord(state, tabId)
    putRecord(state, tabId, {
      ...record,
      document: { status: 'loading', path, ...previousContent(record.document, path) },
    })
  },
  /** @param {SddState} state @param {string} tabId @param {string} path @param {string} text @param {string} version */
  documentReady(state, tabId, path, text, version) {
    putRecord(state, tabId, {
      ...currentRecord(state, tabId),
      document: { status: 'ready', path, text, version },
    })
  },
  /** @param {SddState} state @param {string} tabId @param {string} path @param {SddFailure} value */
  documentFailed(state, tabId, path, value) {
    const record = currentRecord(state, tabId)
    putRecord(state, tabId, {
      ...record,
      document: { status: 'error', path, failure: value, ...previousContent(record.document, path) },
    })
  },
  /** @param {SddState} state @param {string} tabId @param {string} path */
  documentMissing(state, tabId, path) {
    putRecord(state, tabId, {
      ...currentRecord(state, tabId),
      selectedPath: undefined,
      document: { status: 'missing', path },
    })
  },
  /** @param {SddState} state @param {string} tabId */
  forgot(state, tabId) {
    state.byTab = Object.fromEntries(Object.entries(state.byTab).filter(([id]) => id !== tabId))
  },
}

/**
 * Create one tab's channels and coordinate Remote work with store writes.
 * @param {string} sessionId
 * @param {any} instance
 * @param {any} remote
 * @returns {any}
 */
function createFace(sessionId, instance, remote) {
  /** @type {Map<string, any>} */
  const tabs = new Map()
  /** @type {Map<string, AbortSignal>} */
  const signals = new Map()
  let admitting = true
  /** @type {Promise<void> | undefined} */
  let disposition

  /** @param {string} tabId */
  const snapshotTab = tabId => instance.getSnapshot().byTab[tabId]

  /**
   * @param {string} tabId
   * @param {AbortSignal} signal
   * @returns {any}
   */
  const ensure = (tabId, signal) => {
    const existing = tabs.get(tabId)
    if (existing !== undefined && !existing.released) return existing
    if (existing !== undefined) {
      existing.signal.removeEventListener('abort', existing.onAbort)
      tabs.delete(tabId)
    }
    signals.set(tabId, signal)
    /** @type {any} */
    const created = {
      id: tabId,
      signal,
      tree: { controller: undefined, generation: 0, tasks: new Set(), inFlight: false },
      document: { controller: undefined, generation: 0, tasks: new Set(), inFlight: false },
      released: false,
      releasePromise: undefined,
      onAbort: undefined,
    }
    created.onAbort = () => { void releaseTab(tabId) }
    signal.addEventListener('abort', created.onAbort, { once: true })
    tabs.set(tabId, created)
    return created
  }

  /**
   * @param {any} tab
   * @param {'tree' | 'document'} kind
   * @returns {{ channel: any, generation: number, signal: AbortSignal }}
   */
  const begin = (tab, kind) => {
    const channel = tab[kind]
    if (channel.controller !== undefined) channel.controller.abort()
    const controller = new AbortController()
    channel.controller = controller
    channel.generation += 1
    return {
      channel,
      generation: channel.generation,
      signal: AbortSignal.any([tab.signal, controller.signal]),
    }
  }

  /**
   * @param {any} tab
   * @param {'tree' | 'document'} kind
   * @param {{ generation: number, signal: AbortSignal }} request
   * @returns {boolean}
   */
  const usable = (tab, kind, request) => admitting
    && !tab.released
    && !request.signal.aborted
    && tab[kind].generation === request.generation

  /**
   * @param {any} channel
   * @param {Promise<unknown>} task
   * @returns {void}
   */
  const track = (channel, task) => {
    channel.tasks.add(task)
    task.then(() => channel.tasks.delete(task), () => channel.tasks.delete(task))
  }

  /** @param {any} tab @param {string} cwd */
  const loadTree = (tab, cwd) => {
    const request = begin(tab, 'tree')
    request.channel.inFlight = true
    instance.actions.treeLoading(tab.id)
    const task = (async () => {
      try {
        const result = await discoverTree(remote.workspaceFiles.list, sessionId, request.signal)
        if (!usable(tab, 'tree', request)) return
        if (!result.ok) {
          instance.actions.treeFailed(tab.id, result.failure)
          return
        }
        if (result.value.missingRoot === true) {
          instance.actions.treeMissingRoot(tab.id)
          cancelDocument(tab)
          return
        }
        instance.actions.treeReady(tab.id, result.value.features)
        reconcile(tab)
      } catch (error) {
        if (usable(tab, 'tree', request)) instance.actions.treeFailed(tab.id, failure('exception', remoteCode(error)))
      } finally {
        request.channel.inFlight = false
      }
    })()
    track(request.channel, task)
  }

  /** @param {any} tab @param {string} path */
  const loadDocument = (tab, path) => {
    const request = begin(tab, 'document')
    request.channel.inFlight = true
    instance.actions.documentLoading(tab.id, path)
    const task = (async () => {
      try {
        const result = await readWholeDocument(remote.workspaceFiles.read, sessionId, path, request.signal)
        if (!usable(tab, 'document', request)) return
        if (!result.ok) {
          instance.actions.documentFailed(tab.id, path, result.failure)
          return
        }
        instance.actions.documentReady(tab.id, path, result.value.text, result.value.version)
      } catch (error) {
        if (usable(tab, 'document', request)) {
          instance.actions.documentFailed(tab.id, path, failure('exception', remoteCode(error)))
        }
      } finally {
        request.channel.inFlight = false
      }
    })()
    track(request.channel, task)
  }

  /** @param {any} tab */
  const cancelDocument = tab => {
    const channel = tab.document
    if (channel.controller !== undefined) channel.controller.abort()
    channel.controller = undefined
    channel.generation += 1
  }

  /** @param {any} tab */
  const reconcile = tab => {
    const state = snapshotTab(tab.id)
    if (state === undefined || state.selectedPath === undefined) return
    const selected = state.selectedPath
    if (findDocument(state.features, selected) === undefined) {
      cancelDocument(tab)
      instance.actions.documentMissing(tab.id, selected)
      return
    }
    if (state.document.status !== 'idle' && state.document.path === selected) return
    loadDocument(tab, selected)
  }

  /** @param {string} tabId @param {string} cwd @param {AbortSignal} signal */
  const open = (tabId, cwd, signal) => {
    if (!admitting) return
    const tab = ensure(tabId, signal)
    if (tab.released) return
    const state = snapshotTab(tabId)
    if (state !== undefined && state.cwd === cwd) {
      if (state.treeStatus === 'loading' && !tab.tree.inFlight) {
        loadTree(tab, cwd)
        return
      }
      if (state.treeStatus !== 'idle') return
    }
    cancelDocument(tab)
    instance.actions.visited(tabId, cwd)
    loadTree(tab, cwd)
  }

  /** @param {string} tabId */
  const noWorkspace = tabId => {
    const tab = tabs.get(tabId)
    if (tab !== undefined) {
      if (tab.tree.controller !== undefined) tab.tree.controller.abort()
      tab.tree.controller = undefined
      tab.tree.generation += 1
      cancelDocument(tab)
    }
    instance.actions.noWorkspace(tabId)
  }

  /** @param {string} tabId @param {string} path */
  const select = (tabId, path) => {
    const remembered = signals.get(tabId)
    const tab = tabs.get(tabId)
      ?? (remembered !== undefined && !remembered.aborted ? ensure(tabId, remembered) : undefined)
    const state = snapshotTab(tabId)
    if (tab === undefined || tab.released || state === undefined) return
    if (findDocument(state.features, path) === undefined) return
    instance.actions.selected(tabId, path)
    loadDocument(tab, path)
  }

  /** @param {string} tabId */
  const reload = tabId => {
    const tab = tabs.get(tabId)
    const state = snapshotTab(tabId)
    if (tab === undefined || tab.released || state === undefined || state.cwd === undefined) return
    const selected = state.selectedPath
    loadTree(tab, state.cwd)
    if (selected === undefined) cancelDocument(tab)
    else loadDocument(tab, selected)
  }

  /** @param {string} tabId */
  const retryTree = tabId => {
    const tab = tabs.get(tabId)
    const state = snapshotTab(tabId)
    if (tab === undefined || tab.released || state === undefined || state.cwd === undefined) return
    loadTree(tab, state.cwd)
  }

  /** @param {string} tabId */
  const retryDocument = tabId => {
    const tab = tabs.get(tabId)
    const state = snapshotTab(tabId)
    if (tab === undefined || tab.released || state === undefined || state.selectedPath === undefined) return
    loadDocument(tab, state.selectedPath)
  }

  /** @param {string} tabId @param {string} path */
  const toggle = (tabId, path) => {
    const state = snapshotTab(tabId)
    if (state === undefined) return
    instance.actions.toggled(tabId, path)
  }

  /** @param {string} tabId @returns {Promise<void>} */
  const releaseTab = tabId => {
    const tab = tabs.get(tabId)
    if (tab === undefined) return Promise.resolve()
    if (tab.releasePromise !== undefined) return tab.releasePromise
    tab.released = true
    for (const kind of ['tree', 'document']) {
      const channel = tab[kind]
      if (channel.controller !== undefined) channel.controller.abort()
      channel.controller = undefined
      channel.generation += 1
    }
    tab.releasePromise = (async () => {
      try {
        await Promise.allSettled([...tab.tree.tasks, ...tab.document.tasks])
      } finally {
        tab.signal.removeEventListener('abort', tab.onAbort)
        if (tabs.get(tabId) === tab) {
          tabs.delete(tabId)
          signals.delete(tabId)
          instance.actions.forgot(tabId)
        }
      }
    })()
    return tab.releasePromise
  }

  /** @returns {Promise<void>} */
  const dispose = () => {
    if (disposition !== undefined) return disposition
    admitting = false
    disposition = (async () => {
      try {
        await Promise.allSettled([...tabs.keys()].map(tabId => releaseTab(tabId)))
      } finally {
        tabs.clear()
        signals.clear()
      }
    })()
    return disposition
  }

  return { open, noWorkspace, select, reload, retryTree, retryDocument, toggle, dispose, releaseTab }
}

/**
 * @param {any} defineStore
 * @param {any} remote
 * @returns {any}
 */
function createStoreAndFaces(defineStore, remote) {
  const handle = defineStore({ init: () => ({ byTab: {} }), actions: storeActions })
  /** @type {WeakMap<object, any>} */
  const faces = new WeakMap()
  /** @type {Set<any>} */
  const owned = new Set()
  const store = {
    ...handle,
    /** @param {string | undefined} scopeKey */
    create(scopeKey) {
      const instance = handle.create(scopeKey)
      if (scopeKey === undefined) return instance
      const face = createFace(String(scopeKey), instance, remote)
      faces.set(instance.actions, face)
      owned.add(face)
      return instance
    },
  }
  /**
   * @param {string} sessionId
   * @param {object} boundActions
   * @returns {any}
   */
  const injectFace = (sessionId, boundActions) => {
    const face = faces.get(boundActions)
    if (face === undefined) throw new Error(`mai-sdd-doc-viewer: Session "${sessionId}" has no store instance`)
    return {
      openTab: face.open,
      noWorkspaceTab: face.noWorkspace,
      selectTab: face.select,
      reloadTab: face.reload,
      retryTreeTab: face.retryTree,
      retryDocumentTab: face.retryDocument,
      toggleTab: face.toggle,
    }
  }
  /** @returns {Promise<void>} */
  const disposeFaces = async () => {
    const facesToDispose = [...owned]
    owned.clear()
    await Promise.allSettled(facesToDispose.map(face => face.dispose()))
  }
  return { store, injectFace, disposeFaces }
}

/**
 * Build the plugin's browser half from its platform modules.
 * @param {{ React: any, defineStore: any, MarkdownText: any, IconRefreshOutlineRegular: any, GuideArtworkFiles: any }} platform
 * @returns {(ctx: any) => void}
 */
function install(platform) {
  const { React, defineStore, MarkdownText, IconRefreshOutlineRegular, GuideArtworkFiles } = platform

/**
 * @param {any} props
 * @returns {any}
 */
function SddTitle(props) {
  return React.createElement('span', null, props.t('title'))
}

/**
 * @param {readonly SddDirectory[]} features
 * @param {SddTabState} state
 * @param {(path: string) => void} onToggle
 * @param {(path: string) => void} onSelect
 * @param {(key: keyof typeof zh) => string} t
 * @returns {any[]}
 */
function renderFeature(features, state, onToggle, onSelect, t) {
  return features.map(feature => {
    const open = state.expanded[feature.path] ?? true
    const children = []
    if (open) {
      for (const directory of feature.directories) children.push(...renderDirectory(directory, state, onToggle, onSelect, t))
      for (const document of feature.documents) children.push(renderDocument(document, state, onSelect))
      if (feature.directories.length === 0 && feature.documents.length === 0) {
        children.push(React.createElement('li', { key: `${feature.path}/empty`, className: 'hint' }, t('empty')))
      }
    }
    return React.createElement('li', { key: feature.path },
      React.createElement('button', {
        type: 'button',
        className: 'node',
        'aria-expanded': open,
        onClick: () => onToggle(feature.path),
      },
      React.createElement('span', { className: 'chevron', 'aria-hidden': 'true' }, open ? '▾' : '▸'),
      feature.name),
      React.createElement('ul', { className: 'tree', hidden: !open }, ...children))
  })
}

/**
 * @param {SddDirectory} directory
 * @param {SddTabState} state
 * @param {(path: string) => void} onToggle
 * @param {(path: string) => void} onSelect
 * @param {(key: keyof typeof zh) => string} t
 * @returns {any[]}
 */
function renderDirectory(directory, state, onToggle, onSelect, t) {
  const open = state.expanded[directory.path] ?? false
  const children = []
  if (open) {
    for (const child of directory.directories) children.push(...renderDirectory(child, state, onToggle, onSelect, t))
    for (const document of directory.documents) children.push(renderDocument(document, state, onSelect))
  }
  return [React.createElement('li', { key: directory.path },
    React.createElement('button', {
      type: 'button',
      className: 'node',
      'aria-expanded': open,
      onClick: () => onToggle(directory.path),
    },
    React.createElement('span', { className: 'chevron', 'aria-hidden': 'true' }, open ? '▾' : '▸'),
    directory.name),
    React.createElement('ul', { className: 'tree', hidden: !open }, ...children))]
}

/**
 * @param {SddDocument} document
 * @param {SddTabState} state
 * @param {(path: string) => void} onSelect
 * @returns {any}
 */
function renderDocument(document, state, onSelect) {
  return React.createElement('li', { key: document.path },
    React.createElement('button', {
      type: 'button',
      className: 'node',
      title: document.path,
      'aria-label': document.path,
      'aria-current': state.selectedPath === document.path ? 'page' : undefined,
      onClick: () => onSelect(document.path),
    }, document.name))
}

/**
 * @param {any} props
 * @returns {any}
 */
function SddBody(props) {
  const {
    useTabInfo, useSessions, useStore, sessionId, t,
    openTab, noWorkspaceTab, selectTab, reloadTab, retryTreeTab, retryDocumentTab, toggleTab,
  } = props
  const info = useTabInfo()
  const tab = info.tab
  const cwd = useSessions((/** @type {any} */ sessions) => selectSessionDirectory(sessions, sessionId))
  /** @type {SddTabState | undefined} */
  const state = useStore((/** @type {any} */ store) => store.byTab[tab.id])
  const treeRef = React.useRef(null)
  const previewRef = React.useRef(null)

  React.useEffect(() => {
    if (cwd === undefined) noWorkspaceTab(tab.id)
    else openTab(tab.id, cwd, tab.signal)
  }, [cwd, noWorkspaceTab, openTab, tab.id, tab.signal])

  const labels = React.useMemo(() => ({
    code: {
      copyLabel: t('codeCopy'),
      copiedLabel: t('codeCopied'),
      toolbarLabels: { codeLabel: t('codeTitle'), wrapLabel: t('codeWrap'), unwrapLabel: t('codeUnwrap') },
    },
    footnotes: t('footnotes'),
  }), [t])

  const treeStatus = state?.treeStatus ?? 'idle'
  const document = state?.document ?? { status: 'idle' }
  const features = state?.features

  /** @param {any} ref */
  const focusRegion = ref => {
    const element = ref.current
    if (element === null) return
    element.focus()
    element.scrollIntoView({ block: 'nearest' })
  }

  const loading = React.createElement('div', { className: 'status', role: 'status' },
    React.createElement('span', { className: 'spinner', 'aria-hidden': 'true' }),
    React.createElement('span', null, t('loading')))

  /** @param {string} message */
  const notice = message => React.createElement('p', { className: 'status' }, message)

  const treeList = features === undefined
    ? null
    : React.createElement('ul', { className: 'tree' },
      ...renderFeature(
        features,
        state ?? { treeStatus, expanded: {}, document },
        path => toggleTab(tab.id, path),
        path => selectTab(tab.id, path),
        t,
      ))

  const treeRetry = React.createElement('div', { className: 'status', role: 'alert' },
    React.createElement('p', null, t('readFailed')),
    React.createElement('button', {
      type: 'button',
      className: 'textButton',
      onClick: () => retryTreeTab(tab.id),
    }, t('retry')))

  let treeContent
  if (features !== undefined && treeStatus !== 'missing-root' && treeStatus !== 'no-workspace') {
    treeContent = React.createElement('div', null,
      treeStatus === 'loading' ? loading : null,
      treeStatus === 'error' ? treeRetry : null,
      features.length === 0 ? notice(t('empty')) : treeList)
  } else if (treeStatus === 'no-workspace') {
    treeContent = notice(t('noWorkspace'))
  } else if (treeStatus === 'missing-root') {
    treeContent = notice(t('missingRoot'))
  } else if (treeStatus === 'error') {
    treeContent = treeRetry
  } else {
    treeContent = loading
  }

  const previewParts = []
  if (document.path !== undefined) {
    previewParts.push(React.createElement('div', { key: 'path', className: 'path' }, document.path))
  }
  if (document.text !== undefined && (document.status === 'loading' || document.status === 'error')) {
    previewParts.push(React.createElement(MarkdownText, {
      key: 'stale',
      text: document.text,
      streaming: false,
      labels,
      omitHtml: true,
    }))
  }
  if (document.status === 'idle') {
    previewParts.push(React.createElement('p', { key: 'idle', className: 'status' }, t('selectDocument')))
  } else if (document.status === 'missing') {
    previewParts.push(React.createElement('p', { key: 'missing', className: 'status' }, t('missingDocument')))
  } else if (document.status === 'loading') {
    previewParts.push(React.createElement('div', { key: 'loading', className: 'status', role: 'status' },
      React.createElement('span', { className: 'spinner', 'aria-hidden': 'true' }),
      React.createElement('span', null, t('loading'))))
  } else if (document.status === 'error') {
    previewParts.push(React.createElement('div', { key: 'error', className: 'status', role: 'alert' },
      React.createElement('p', null, t('readFailed')),
      React.createElement('button', {
        type: 'button',
        className: 'textButton',
        onClick: () => retryDocumentTab(tab.id),
      }, t('retry'))))
  } else if (document.status === 'ready' && document.text !== undefined) {
    previewParts.push(React.createElement(MarkdownText, {
      key: 'ready',
      text: document.text,
      streaming: false,
      labels,
      omitHtml: true,
    }))
  }

  return React.createElement('div', { 'data-mai-sdd-doc-viewer': '' },
    React.createElement('header', { className: 'header' },
      React.createElement('span', { className: 'title' }, t('title')),
      React.createElement('button', {
        type: 'button',
        className: 'iconButton',
        title: t('reload'),
        'aria-label': t('reload'),
        disabled: treeStatus === 'loading' || state?.cwd === undefined,
        onClick: () => reloadTab(tab.id),
        'data-mai-sdd-reload': '',
      }, React.createElement(IconRefreshOutlineRegular, { size: 16 }))),
    React.createElement('nav', { className: 'nav', 'aria-label': t('title') },
      React.createElement('button', { type: 'button', className: 'navButton', onClick: () => focusRegion(treeRef) }, t('treeLabel')),
      React.createElement('button', { type: 'button', className: 'navButton', onClick: () => focusRegion(previewRef) }, t('previewLabel'))),
    React.createElement('div', { className: 'layout' },
      React.createElement('section', {
        className: 'pane treePane',
        ref: treeRef,
        tabIndex: -1,
        'aria-label': t('treeLabel'),
        'data-mai-sdd-tree': '',
      }, treeContent),
      React.createElement('section', {
        className: 'pane previewPane',
        ref: previewRef,
        tabIndex: -1,
        'aria-label': t('previewLabel'),
        'data-mai-sdd-preview': '',
      }, ...previewParts)))
}

/**
 * Register the page, its title, the locale dictionary, and a quiescent cleanup.
 * @param {any} ctx
 * @returns {void}
 */
function apply(ctx) {
  const t = ctx.locale.bind(NS)
  const { store, injectFace, disposeFaces } = createStoreAndFaces(defineStore, ctx.remote)

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'mai-sdd-doc-viewer: dictionaries')
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: PLUGIN_ID,
    kind: KIND,
    title: () => t('title'),
    guide: [{
      id: KIND,
      order: 900,
      title: () => t('title'),
      description: () => t('guideDescription'),
      icon: GuideArtworkFiles,
    }],
  }), 'mai-sdd-doc-viewer: tab type')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: PLUGIN_ID,
    locale: NS,
    store,
    inject: injectFace,
  }, SddBody)), 'mai-sdd-doc-viewer: tab body')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title',
    key: PLUGIN_ID,
    locale: NS,
  }, SddTitle)), 'mai-sdd-doc-viewer: tab title')
  ctx.effect(() => async () => { await disposeFaces() }, 'mai-sdd-doc-viewer: quiescent cleanup')
}

  return apply
}

window.__ModuleLoader__.load({
  id: PLUGIN_ID,
  meta() {
    return { stylesheets: { 'style.css': { text: () => scopedStyles } } }
  },
  /** @param {(id: string) => any} require */
  factory(require) {
    const { defineStore } = require('@deepseek-ai/dsh-client-store')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    return {
      inject: ['slots', 'locale', 'sidebarRightTabs', 'remote', 'remote.workspaceFiles'],
      apply: install({
        React: require('react'),
        defineStore,
        MarkdownText: primitives.MarkdownText,
        IconRefreshOutlineRegular: primitives.IconRefreshOutlineRegular,
        GuideArtworkFiles: primitives.GuideArtworkFiles,
      }),
    }
  },
})
})()
