# mai-sdd-doc-viewer DSH 插件技术方案

> Feature：999-mai-sdd-doc-viewer | 有效需求来源：[PRD（草稿，待评审）](../spec/PRD.md) | Profile：standard | 模板：[TECH_DESIGN.tmpl.md](../../_templates/TECH_DESIGN.tmpl.md) | 代码基线：`feat/mai-sdd-plugin` | 状态：草案（待评审）

[返回需求简报](../BRIEF.md)

本文代码均为供评审的设计示意，尚未写入插件生产源码，也未经过编译、浏览器或测试验证。PRD 仍是需求与验收的唯一维护源；本文不复制或修改其业务规则。

## 需求依据与验收

本次交付覆盖 PRD 的 FR-01 至 FR-08、BR-01 至 BR-07、NFR-01 至 NFR-04 和 AC-01 至 AC-11：在 DSH Web 现有右侧 Sidebar 中，按当前 Session 工作区的 `mai-specs/NNN-slug/` 聚合全部 Markdown 文档，提供只读导航、渲染预览、手动重新读取、明确的空态与失败恢复，并交付课程要求的插件文件和 SDD 证据。

硬约束如下：

- 运行功能全部位于浏览器客户端；Host companion 不读取文件、不注册命令、不创建子进程。
- 只调用现有 `workspaceFiles.list` 和 `workspaceFiles.read`；不调用会启动 `rg` 的 `workspaceFiles.search`，不执行 `mai`、SDD、Git 或其他命令。
- 不读取或要求 LLM API Key，不发起 LLM 请求，不写文件，不把文档路径或内容注入模型请求、提示词、工具或 Session 事件。
- 文档读取仅接受从固定 `mai-specs` 树发现的规范相对路径；即使 `read` 允许工作区外路径，本插件也不使用该能力。
- 本阶段只形成技术设计，不推进 Feature Phase，不创建后续评审、测试或实现产物。

## 1. 方案概述

### 1.1 设计目标和设计原则

采用无构建 Raw JS 动态客户端包，以最少仓库改动复用现有 Sidebar、Remote、React、store 和 `MarkdownText`。插件新增一个 page 类型，不新建 Sidebar，不替换文件页或通用 Markdown 预览，也不运行时导入其他功能插件的内部组件。

正确性优先于简化读取：目录截断、目录符号链接、无效 Remote 条目、分页版本变化和过期响应均不得被当作完整且最新的结果。已有完整树或文档在后台刷新失败时继续可见，并显示原地错误与重试；首次读取失败则显示独立错误态。

插件不增加部署配置。文档根、Feature 命名、文件扩展名、排序和界面行为均由 PRD 固定；Host 的分页及目录条目上限继续由 `workspaceFiles.Config` 管理，不在本插件复制配置。

### 1.2 整体架构

| 层 | 现有能力 | 本插件职责 |
| --- | --- | --- |
| Cordis 组合 | `cordis.patch.yml`、Loader 动态包扫描 | 插入 `@local/mai-sdd-doc-viewer`；`index.js` 提供空 Host `apply()`，使包具有完整 Host/Client 入口。 |
| 浏览器注册 | `sidebarRightTabs`、`sidebar.right.pane.tab`、`.title`、`locale` | 注册独立 `mai-sdd-documents` page、引导入口、面板 body/title 和中英文字典；所有注册由 `ctx.effect()` 持有。 |
| 面板状态与读取 | `@deepseek-ai/dsh-client-store`、tab `signal`、`remote.workspaceFiles` | Session 级 store 按 `tab.id` 分区；apply 内 face 执行递归发现、分页读取、取消和 generation 检查。组件不接触 `ctx` 或 Remote。 |
| 展示 | 共享 React、`ui-primitives` 的 `MarkdownText`、`Button`、`Tooltip`、图标 | 渲染层级导航、路径、状态和只读 Markdown；使用语义 token 和动态包样式协议。 |
| Host 文件能力 | `workspaceFiles.list/read` | 仅作为被调用方；不新增 Host API、配置、持久化、Session 事件或模型输入。 |

拟新增和修改的文件如下；除集成测试及根作业说明外，运行代码均限于课程指定目录。

```text
plugins/mai-sdd-doc-viewer/
├── package.json          # 动态包元数据、icon、Host/Client exports
├── cordis.patch.yml      # Cordis insert
├── index.js              # 空 Host companion
├── client.js             # 注册、store、读取 face、组件、字典和作用域样式
├── icon.svg              # 非官方课程插件包图标
├── tsconfig.json         # allowJs/checkJs/noEmit；paths 指向 packages/*/src
├── README.zh.md
└── README.md
apps/web/tests/mai-sdd-doc-viewer.e2e.ts
apps/web/tests/expected/mai-sdd-doc-viewer/   # keyless 可访问结构基线
mai-specs/999-mai-sdd-doc-viewer/             # 持续保留实际 SDD 产物
README.zh.md                                   # 最终实现阶段增加课程作业说明
```

`plugins/` 当前不在 `pnpm-workspace.yaml` 中，因此不假设该包自动获得 workspace 构建、裸包依赖解析、Vitest include 或覆盖率检查。加载通过 `launchWebScaffold({ extraInstallAnchors: [package.json] })` 和 Loader entry 验证；类型检查显式执行插件 tsconfig，浏览器测试放入现有 `apps/web/tests` include 范围。无需为课程插件改动 workspace globs 或引入 tsdown。

### 1.3 关键决策与 Review 索引

| 决策 | 推荐及理由 | 代价与备选 | 待判断事项/确认状态 | 详情 |
| --- | --- | --- | --- | --- |
| Raw JS 动态包 | 复用已存在的无构建加载协议，避免为单个课程插件接入 workspace 构建链。 | 单文件较长，静态门覆盖少于正式 workspace 包；备选为标准 TS/tsdown 包，但仓库改动和配置更多。 | 推荐，待设计评审；不得把 fixture 的运行证据当成静态检查通过。 | 2.3.1、2.3.4 |
| 独立 Sidebar page | `id` 同时作为实现身份和 body/title key，`kind` 仅用于打开页面；省略 `patterns`、`multiple`、`keepMounted`，每 pane 每 kind 一页。 | 不沿用通用文件页的全部交互；备选为改造文件页，会侵入其他功能插件。 | 推荐，待设计评审。 | 2.3.1 |
| 递归 `list` | 满足“全部 `.md`”且无子进程；`search` 会调用 packaged ripgrep，禁止使用。 | 顺序目录请求多于一次搜索；当前规模没有性能目标，先选择简单可取消遍历。 | 推荐，待设计评审。 | 2.3.2 |
| Session store + tab face | store 保留面板状态，face 管理异步读取；按 `tab.id` 和 channel 取消，避免跨 pane、同名文档及过期响应串扰。 | 需要少量生命周期簿记；备选为组件局部 `fetch` 状态，会丢失 tab 外状态并混淆卸载责任。 | 推荐，待设计评审。 | 2.1、2.3.3 |
| 完整分页读取 | 所有页必须属于同一 `version`；变化或无效进度返回失败，不自动循环重启，不展示部分内容。 | 外部频繁修改时用户需手动重试；备选为自动重启，会引入重试预算和额外竞态。 | 推荐，待设计评审。 | 2.3.3 |
| JSDoc 字典和作用域样式 | `en` 用 `Record<keyof typeof zh, string>` 检查键集合；`meta().stylesheets` 使用根属性作用域和语义 token。 | Raw JS 无 CSS Modules，仓库现有 i18n/CSS 静态门不会自动覆盖全部内联内容；需要显式 `checkJs`、源码审查和真实页面检查。 | 推荐，待设计评审；这是 Raw JS 方案的主要持续维护成本。 | 2.3.4 |
| 窄面板单栏导航 | 宽面板并排；窄面板保持树和预览挂载，以单栏及可见“文档树/文档预览”导航到达两个区域，避免断点变化重挂载聚焦控件。 | 长页面需要内部滚动和区域聚焦；备选为条件卸载另一区域，会损失滚动和焦点状态。 | 推荐，待设计评审和 390 CSS px 实页验证。 | 2.3.4 |

## 2. 详细设计方案

### 2.1 核心结构设计

#### 2.1.1 数据结构设计

以下为 `client.js` 内部 JSDoc 模型的语义，不是新增 wire API。`TreeStatus`、`DocumentState` 使用判别字段，界面不得靠错误文本推断状态。

```js
/**
 * @typedef {{ readonly name: string, readonly path: string }} SddDocument
 * @typedef {{
 *   readonly name: string,
 *   readonly path: string,
 *   readonly kind: 'feature' | 'directory',
 *   readonly directories: readonly SddDirectory[],
 *   readonly documents: readonly SddDocument[],
 * }} SddDirectory
 * @typedef {{ readonly reason: string, readonly code: string }} SddFailure
 * @typedef {'idle'|'loading'|'ready'|'no-workspace'|'missing-root'|'error'} TreeStatus
 * @typedef {
 *   | { readonly status: 'idle' }
 *   | { readonly status: 'loading', readonly path: string, readonly text?: string, readonly version?: string }
 *   | { readonly status: 'ready', readonly path: string, readonly text: string, readonly version: string }
 *   | { readonly status: 'error', readonly path: string, readonly failure: SddFailure, readonly text?: string, readonly version?: string }
 *   | { readonly status: 'missing', readonly path: string }
 * } DocumentState
 * @typedef {{
 *   readonly cwd?: string,
 *   readonly treeStatus: TreeStatus,
 *   readonly treeFailure?: SddFailure,
 *   readonly features?: readonly SddDirectory[],
 *   readonly selectedPath?: string,
 *   readonly expanded: Readonly<Record<string, boolean>>,
 *   readonly document: DocumentState,
 * }} SddTabState
 * @typedef {{ readonly byTab: Readonly<Record<string, SddTabState>> }} SddState
 */
```

路径和状态不变量：

- `path` 是 `/` 分隔的工作区相对完整路径。Feature 必须匹配 `mai-specs/<三位数字>-<非空 slug>`；文档必须位于此类目录内并以小写 `.md` 结尾。basename 不是身份。
- `expanded[path]` 只保存用户显式展开/折叠覆盖；未覆盖的 Feature 默认展开，更深层目录默认折叠。刷新后删除已不存在目录的覆盖项，React key 始终为完整 `path`。
- `features === undefined` 表示从未成功发现；空数组表示成功但没有符合规则的 Feature。空 Feature 保留节点并显示 COPY-06。
- `treeStatus === 'error'` 可携带旧 `features`；`loading` 同样保留旧树。`missing-root` 和 `no-workspace` 清除失效树、选择和预览。
- `DocumentState.path` 是本次或最近一次请求身份。仅重读同一文档时携带旧 `text/version`；选择不同文档不得把旧正文显示在新路径下。
- store 是 Session scope 的面板私有读取与视图状态，不持久化到 localStorage、Session 或文件。所有数据保持 JSON 兼容；AbortController、generation 和监听器只存在 face，不进入 store。

#### 2.1.2 数据流设计

| 触发 | face 行为 | 可见结果 |
| --- | --- | --- |
| body 打开 | 通过 `useSessions` 内联选择当前 cwd；无 cwd 则取消两路读取并显示 COPY-04。相同 cwd 且已有结果时不重复读取；cwd 改变按重新读取处理。 | 初始 COPY-03，或保留该 tab 已有状态。 |
| 目录发现 | 读取 `mai-specs`，筛选直接 Feature，逐层顺序 `list`；仅收集 `.md`，随后构建并排序树。 | 成功显示树；根不存在/不是目录显示 COPY-05；其他失败显示 COPY-08/09。 |
| 选择文档 | 校验路径来自当前树，更新 `selectedPath`，取消旧 document channel，从第 1 行分页读取。 | 初次显示 COPY-03；成功显示路径和 Markdown；失败显示 COPY-08/09。 |
| 手动重新读取 | 立即取消旧 tree/document channel，保留旧树和旧正文；同时启动目录发现与当前选择的分页重读。目录成功后裁剪展开状态并校验最新选择，不重复重启同路径的当前文档请求；选择已删除则取消 document channel 并清除正文。 | 修改和新增可见；删除显示 COPY-10；仍有效的展开和选中状态保留。 |
| 重试 | 目录错误仅重启 tree channel；文档错误仅重启 document channel；随后按各自 generation 提交。 | 重试期间不清空有效旧内容，成功后清除错误。 |
| tab 关闭 | `releaseTab(tabId)` 中止该 tab 两路 controller、使 generation 失效，等待其已接纳任务 settle 后只忘记该 tab 记录；face 仍接纳其他 tab 的工作。 | 其他 pane 的同类页面不受影响。 |
| 插件卸载 | `disposeFace()` 先关闭 face 准入闸，再逐个 `releaseTab()`，等待全部清理后移除监听与记录。注册和样式由框架移除。 | 无迟到更新、未完成的自有异步任务、全局单例或残留入口。 |

目录和文档各有独立 `generation/controller/tasks`。这样目录刷新期间仍可从旧树选择文档；选择事件照常取消并替换 document channel，目录完成后只校验最新选择，不无条件重启文档。旧目录响应不能覆盖新刷新，旧文档响应不能覆盖新选择。

所有权分两级：一个 Session 的 store 实例对应一个 face，face 以 `tab.id` 分区保存各 tab 的两路 channel；`tab.signal` 只结束所属 tab，`disposeFaces()` 才结束整个 face。Abort 只请求中止，generation 只阻止过期写入，一级清理完成还以该级已接纳 Promise 全部 settle 为准；关闭一个 tab 不得关闭 face 或其他 tab 的准入。

#### 2.1.3 接口设计

不新增 Host 接口。face 仅绑定以下现有 Remote 形式，`sessionId` 使用 Slot 当前 Session，相对路径由 Host 针对该 Session 工作区解析：

```js
// Existing Remote contracts, shown here as design notes rather than new exports.
// list(sessionId, path, signal) -> Promise<RemoteResult<WorkspaceDirectoryListing>>
// read(sessionId, path, { offset }, signal) -> Promise<RemoteResult<WorkspaceFileText>>
```

`list` 返回 `{ path, entries, truncated }`；`read` 的 `offset` 从 1 开始，返回 `{ version, offset, text, lines, eof }`。正常 Remote 失败通过 `{ ok: false, error }` 返回；Promise rejection 和取消仍需由 face 处理。错误处理只读取结构化 `name/code`，不解析 message；界面统一使用本地化 COPY，内部 code 和路径仅用于控制台诊断与测试断言。

工作区 cwd 选择内联现有 `selectSessionDirectory` 的纯读取顺序：投影 `workingDirectory`、旧投影值、Session header `cwd`，均不存在则 `undefined`。该源码明确要求 Client 插件内联此 helper，且当前动态模块表没有 `client/directories` row，因此不声明未验证的 `dsh.client.external`，也不复制 Host 的 sandbox fallback 作为前端工作区猜测。

### 2.3 分模块详细设计

#### 2.3.1 动态包与 Cordis 注册

`package.json` 使用 `name: @local/mai-sdd-doc-viewer`、`private: true`、`type: module`、`main: index.js`、`icon: ./icon.svg`，导出 `.`、`./client`、`./icon` 和 `./package.json`；声明 `dsh.bundle.patch` 与 `dsh.client.platform: web`。`cordis.patch.yml` 以 `insert` 引入同名包。`index.js` 只导出空 `apply()`，解释 Host companion 不承担功能。

`client.js` 只从平台表请求 `react`、`@deepseek-ai/dsh-client-store` 和 `@deepseek-ai/dsh-client-ui-primitives`，因此无需 `dsh.client.external`。服务注入为 `slots`、`locale`、`sidebarRightTabs`、`remote`、`remote.workspaceFiles`；不注入 LLM、credentials、subprocess、shell、Git 或 SDD 服务。

```js
// Design sketch: registration only. SddBody's rendering contract is in 2.3.4.
window.__ModuleLoader__.load({
  id: '@local/mai-sdd-doc-viewer',
  meta() {
    return { stylesheets: { 'style.css': { text: () => scopedStyles } } }
  },
  factory(require) {
    const React = require('react')
    const { defineStore } = require('@deepseek-ai/dsh-client-store')
    const { GuideArtworkFiles } = require('@deepseek-ai/dsh-client-ui-primitives')
    return {
      inject: ['slots', 'locale', 'sidebarRightTabs', 'remote', 'remote.workspaceFiles'],
      apply(ctx) {
        const NS = 'maiSddDocViewer'
        const t = ctx.locale.bind(NS)
        const { store, injectFace, disposeFaces } = createStoreAndFaces(defineStore, ctx.remote)
        ctx.effect(() => ctx.locale.register(NS, { zh, en }))
        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: '@local/mai-sdd-doc-viewer',
          kind: 'mai-sdd-documents',
          title: () => t('title'),
          guide: [{
            id: 'mai-sdd-documents', order: 20,
            title: () => t('title'), description: () => t('guideDescription'), icon: GuideArtworkFiles,
          }],
        }))
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
          { name: 'sidebar.right.pane.tab', key: '@local/mai-sdd-doc-viewer', locale: NS, store, inject: injectFace },
          SddBody,
        )))
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register(
          { name: 'sidebar.right.pane.tab.title', key: '@local/mai-sdd-doc-viewer', locale: NS },
          SddTitle,
        )))
        ctx.effect(() => async () => { await disposeFaces() })
      },
    }
  },
})
```

`createStoreAndFaces()` 在 apply 内创建 `defineStore` handle。包装 `handle.create(scopeKey)` 时由框架创建 Session 实例，并把 `instance.actions` 到 face 的映射保存在 apply 私有 `WeakMap`；face 可读取该实例快照，组件只得到 `useStore/actions` 和窄回调。

face 的公开操作分三级：`open(tabId, cwd)`、`select(tabId, path)`、`reload(tabId)` 等按 tab 接纳工作；`releaseTab(tabId)` 只结束该 tab 并保留 face 与其他 tab；`disposeFace()` 关闭 face 准入闸并结束其全部 tab。apply 私有集合跟踪活跃及正在关闭的 face，`disposeFaces()` 同步关闭各 face 准入闸，再等待全部清理 Promise 完成。任何 store handle、face、controller、任务集合或可变状态都不得提升到模块级。

`SddBody`、`SddTitle` 及子组件均为模块级稳定函数；注册时不得创建箭头组件。`SddTitle` 只显示 COPY-01。`icon.svg` 是课程插件包的非官方文档图标，Sidebar guide 直接复用 `GuideArtworkFiles`，不复制其 SVG；新包图标和可见交互在实现交付前需要设计/产品评审。

#### 2.3.2 只读递归发现与排序

所有目录条目先经过 `childPath()`：名称不得为空、`.`、`..`，不得包含 `/`、`\\` 或 NUL；拼接结果仍须符合固定根规则。`listExact()` 要求 Host 返回的 `listing.path === 请求路径` 且 `truncated === false`。前者阻止通过目录符号链接离开已发现的规范树或形成循环，后者阻止把 Host 截断结果当成完整树。文件符号链接由 Host `read` 的 final-component no-follow 检查拒绝，界面显示读取失败。

以下结果联合是内部返回值，不定义新的错误类或 Remote code。`remote` 保留原结构化 code；`incomplete`、`version-changed` 和 `invalid-page` 是本插件可判定的失败判别值。

```js
// Design sketch: complete discovery policy; UI wiring is in 2.3.3.
const ok = value => ({ ok: true, value })
const fail = (reason, code) => ({ ok: false, failure: { reason, code } })

function isSddDocumentPath(path) {
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0')) return false
  const segments = path.split('/')
  return segments.length >= 3 && segments[0] === 'mai-specs' && /^\d{3}-.+$/.test(segments[1])
    && segments.every(segment => segment !== '' && segment !== '.' && segment !== '..')
    && segments.at(-1).endsWith('.md')
}

function childPath(parent, name) {
  if (name === '' || name === '.' || name === '..' || /[/\\\0]/.test(name)) throw new Error('Invalid workspace entry name')
  return `${parent}/${name}`
}

async function listExact(list, sessionId, path, signal) {
  const result = await list(sessionId, path, signal)
  if (!result.ok) return fail('remote', result.error.code)
  const listing = result.value
  if (listing.truncated) return fail('incomplete', 'mai-sdd/truncated-directory')
  if (listing.path !== path) return fail('incomplete', 'mai-sdd/resolved-directory')
  for (const entry of listing.entries) childPath(path, entry.name)
  return ok(listing.entries)
}

async function discoverTree(list, sessionId, signal) {
  const root = await listExact(list, sessionId, 'mai-specs', signal)
  if (!root.ok) {
    const missing = root.failure.reason === 'remote'
      && ['workspace-file/not-found', 'workspace-file/not-directory'].includes(root.failure.code)
    return missing ? ok({ status: 'missing-root' }) : root
  }
  const features = []
  for (const entry of root.value) {
    if (entry.type !== 'directory' || !/^\d{3}-.+$/.test(entry.name)) continue
    const path = childPath('mai-specs', entry.name)
    const documents = []
    const visited = new Set()
    const walk = async directory => {
      if (visited.has(directory)) return fail('incomplete', 'mai-sdd/directory-cycle')
      visited.add(directory)
      const listed = await listExact(list, sessionId, directory, signal)
      if (!listed.ok) return listed
      for (const child of listed.value) {
        const path = childPath(directory, child.name)
        if (child.type === 'directory') {
          const walked = await walk(path)
          if (!walked.ok) return walked
        } else if (child.type === 'file' && child.name.endsWith('.md')) {
          documents.push({ name: child.name, path })
        }
      }
      return ok(undefined)
    }
    const walked = await walk(path)
    if (!walked.ok) return walked
    features.push({ name: entry.name, path, documents })
  }
  return ok({ status: 'ready', features: buildSortedTree(features) })
}
```

`buildSortedTree()` 只保留含文档的子目录及其祖先，并为每个 Feature 保留根节点。Feature 按名称自然升序；每层目录先于文件，再分别按名称自然升序。比较器固定 `Intl.Collator('en', { numeric: true })`，与 UI locale 无关，并以代码单元比较打破相等项，保证完整路径唯一且顺序稳定。

根目录的 `not-found/not-directory` 映射 COPY-05；根 `mai-specs` 或某个 Feature 目录自身解析为其他路径（目录符号链接）时，`listing.path` 等值检查失败并映射 COPY-08，不跟随链接改变固定根。子目录在遍历中消失、目录符号链接、截断、越界或其他失败均映射 COPY-08，不静默跳过后宣称完整。顺序遍历不引入请求池或并发限制配置。

#### 2.3.3 分页、取消与刷新提交

`readWholeDocument()` 只接受 `isSddDocumentPath(path)` 为真的完整相对路径。第一页 `offset = 1`，后续 `offset += page.lines`，页文本以 `\n` 连接，`lines === 0` 的空页不参与拼接，避免正文尾部多出换行。所有页必须与第一页 `version` 相同；`lines` 必须是非负安全整数，未 EOF 时必须有正进度。版本变化、无效页或 Remote 失败均丢弃本次部分页，旧完整正文若属于同一路径则保留。

```js
// Design sketch: one complete, version-consistent document read.
async function readWholeDocument(read, sessionId, path, signal) {
  if (!isSddDocumentPath(path)) return fail('invalid-path', 'mai-sdd/invalid-document-path')
  let offset = 1
  let version
  const parts = []
  while (true) {
    const result = await read(sessionId, path, { offset }, signal)
    if (!result.ok) return fail('remote', result.error.code)
    const page = result.value
    if (version !== undefined && page.version !== version) return fail('version-changed', 'mai-sdd/version-changed')
    if (!Number.isSafeInteger(page.lines) || page.lines < 0 || (!page.eof && page.lines === 0)) {
      return fail('invalid-page', 'mai-sdd/invalid-page')
    }
    version = page.version
    if (page.lines > 0) parts.push(page.text)
    if (page.eof) return ok({ text: parts.join('\n'), version })
    offset += page.lines
  }
}
```

face 的 `byTab[tabId]` 各保存 `tree` 和 `document` 两个 channel。channel 记录 `generation/controller/tasks`，其中 `tasks` 跟踪完整发现或读取 Promise 及其 settlement 发布过程，而非只跟踪首个 Remote 调用；face 记录是否仍接纳任务、各 tab 的释放状态与 Promise，以及 face 级 `disposePromise`。`nextRequest(channel)` 先确认 face 与该 tab 都仍接纳任务，再 abort 旧 controller、递增 generation，以 `AbortSignal.any([tab.signal, controller.signal])` 调用 Remote，并把完整异步操作纳入 `tasks`，操作结束后只移除自身。每个 settlement 在写 store 前同时检查 signal 未 abort、generation 仍为当前值且该 tab 未释放；取消后的 rejection 不写状态，非自身取消的 rejection 记录诊断并进入 COPY-08。停止接纳后不得再创建 Remote 操作。

`tab.signal` 的首次读取注册一次性 abort 监听，回调同步启动该 tab 的幂等 `releaseTab(tabId)`，apply 跟踪其返回 Promise，不能把 signal 回调触发当作清理完成。`releaseTab()` 的顺序固定为：

1. 把该 tab 标记为已释放，使两路 generation 失效并 abort 两个 controller；face 仍接纳其他 tab。
2. 对该 tab 两路 `tasks` 执行 `Promise.allSettled()`，等待全部已接纳操作及其 settlement 处理结束；等待期间该 tab 不再接纳新工作，已有 abort/generation 阻止迟到写入。
3. 在 `finally` 中移除该 tab 的监听、从 face 的 `byTab` 删除并调用 `actions.forget(tabId)`，保证等待或诊断失败不会跳过资源释放。

插件卸载的 `disposeFace()` 先同步关闭 face 准入闸，再对每个仍存在的 tab 调用或取得 `releaseTab()`，等待全部 tab 清理完成后删除 face；`disposeFaces()` 对所有活跃及正在关闭的 face 同步关闭准入并统一等待清理 Promise。单个 Promise rejection 不得让清理提前返回、跳过其他 tab/face 或跳过资源释放。上述 async `ctx.effect` disposer 完成前，插件卸载尚未完成。face 不得在组件 render 中启动 Promise；打开/切换 cwd 由组件 effect 调用注入的 `open`，选择、刷新、重试和展开由事件回调触发。

手动刷新的启动与提交顺序固定为：

1. 刷新事件先同步取消两路旧操作并保留旧树、选择和旧正文，再启动 tree discovery；若当前有选择，同时启动该路径的 document 全量重读，不等待目录发现完成。两路结果按各自 generation 独立提交。
2. 目录成功后，以最新树替换 `features`，裁剪 `expanded`，清除旧目录错误。
3. 从 store 快照重新读取最新 `selectedPath`，而不是捕获刷新开始时的旧值。选择仍存在时，若 document channel 的当前路径已等于该选择，保留其进行中的请求或已经提交的成功/失败结果，不再次启动；否则为该最新选择启动读取。
4. 选择已不存在时，使旧 document channel 失效并 abort，清除 `selectedPath` 和旧正文，写入 `{ status: 'missing', path }` 显示 COPY-10。无选择时保持 `document.status` 为 `idle`；已有 COPY-10 可保留到下一次选择，避免把删除提示伪装成普通空态。
5. 目录失败时保留旧树和选择，不触发基于不完整树的删除判断；并发文档读取已提交的有效结果或错误继续保留。

#### 2.3.4 UI、文案、样式与 Markdown

`SddBody` 的 props 仅来自 Slot 五类 share 和 inject face。它通过框架 `useSessions` 读取 cwd，通过 `useStore` 选择当前 tab 状态；不向子组件传递整个 store、service 或 ctx。目录使用嵌套列表和原生 `button`，以 `aria-expanded`、`aria-current`、完整路径可访问名称及 visible focus 提供键盘操作，不声明需要额外方向键模型的 ARIA `tree` 角色。

主要渲染规则：

- 头部始终保留 COPY-01 和带 `IconRefreshOutlineRegular` 的“重新读取”按钮；目录加载时禁用重复刷新，按钮稳定挂载。图标按钮使用共享 `Tooltip` 和 COPY-02 可访问名称。
- 首次目录/文档加载使用一个 spinner 和 COPY-03；有旧内容时改为紧凑 `role=status`，不替换旧 DOM。空面板错误居中，有内容错误在所属区域原地显示 `role=alert`、COPY-08 和 COPY-09。
- 宽面板为导航与预览双列，二者均 `min-width: 0` 并各自滚动。窄面板为单栏，保留两个区域挂载，以始终可见的“文档树/文档预览”按钮滚动并聚焦对应区域；选择文档后可到达预览，390 CSS px 下无页面级横向滚动或被遮挡操作。
- 文档节点和预览路径以完整相对路径作为可访问名称；长路径在所属滚动区内换行或截断，完整路径仍可从预览读取。刷新和布局变化使用稳定 key，不重挂载头部按钮或仍可见区域。
- `MarkdownText` 使用 `text=完整正文`、`streaming={false}`、`labels` 和 `omitHtml`；不传 `fileMentions/pathImages`，因此相对文件链接不成为任意文件打开通道，相对图片不解析为额外读取。绝对 HTTP(S) 行为保持 primitive 默认值，Mermaid 不新增图形化扩展。
- Markdown 区域具有可聚焦 `role=region` 和 COPY-01/预览名称。代码块及脚注 labels 以 `useMemo` 按 locale 字符串保持引用稳定。

COPY-01 至 COPY-10 直接采用 PRD 最终文案，不在本文另建真源。新增键仅包括：

| key | zh | en |
| --- | --- | --- |
| `guideDescription` | 按 Feature 浏览 SDD Markdown 规格文档 | Browse SDD Markdown specifications by feature |
| `navigation.tree` | 文档树 | Document tree |
| `navigation.preview` | 文档预览 | Document preview |
| `markdown.code.copy` | 复制代码 | Copy code |
| `markdown.code.copied` | 已复制 | Copied |
| `markdown.code.title` | 代码块 | Code block |
| `markdown.code.wrap` | 自动换行 | Wrap lines |
| `markdown.code.unwrap` | 不换行 | Do not wrap lines |
| `markdown.footnotes` | 脚注 | Footnotes |

字典采用扁平键，`zh` 为键集合来源，`en` 以 JSDoc `Record<keyof typeof zh, string>` 约束；`// @ts-check` 和插件 tsconfig 开启 `allowJs/checkJs/noEmit`。`plugins/` 不参与 workspace 安装，仓库根也没有 `@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-primitives` 的可解析副本，因此 tsconfig 必须用 `compilerOptions.paths` 把 `react` 与这两个平台模块指向 `packages/client/*/src` 入口，并在仓库根执行 `tsc -p plugins/mai-sdd-doc-viewer`；若不引入跨包类型，则 T2 只保留本地字典键检查，并在 T8 登记该覆盖降级。实现时还需核对 `t()` 的键推断，不能用 plain object 可注册替代类型检查。

Raw JS 样式通过 `meta().stylesheets['style.css'].text` 提供，所有规则限定在 `[data-mai-sdd-doc-viewer]` 下，使用 `--dsw-alias-*`、既有排版角色和共享滚动条；禁止字面颜色、全局主题选择器、Tailwind、新组件库和静态 inline style。`:hover` 仅置于 `@media (hover: hover)`，focus/selected 状态独立于 hover。该形式是无构建动态包的样式协议，不宣称等同于 CSS Modules 静态门覆盖。

### 2.4 供评审的代码设计（for review check）

评审重点与代码位置如下，无需另建代码附录：

- 注册、依赖与卸载：2.3.1；重点检查 store/face 是否仅在 apply 内创建，Slot key 是否与 definition `id` 一致，组件是否稳定且无 ctx。
- 数据身份和状态不变量：2.1；重点检查同名文档、多 pane、空 Feature、旧内容保留和删除选择。
- 递归发现：2.3.2；重点检查不完整的 `list`、目录符号链接、条目名称和 Feature 过滤是否可能逃逸固定根。
- 分页、竞态和销毁：2.3.3；重点检查不同 `version` 是否可能拼接、无进展页是否循环、旧 settlement 是否可能覆盖新选择，以及 disposer 是否持续等待到 deferred 读取真正 settle。
- UI 和本地化：2.3.4；重点检查 Raw JS 的 typed dictionary 是否真正执行检查，窄面板是否保留焦点与导航，所有 primitive 文案是否进入字典。

外围清单、完整 React 元素和 CSS 不在示意中展开；它们不改变上述核心决策。示意图尚未运行，实施必须以真实接口编译和 AC 测试收敛，不能直接复制后宣称完成。

## 3. 风险评估

| 风险与触发条件 | 影响 | 缓解措施 | 验证方式 |
| --- | --- | --- | --- |
| 使用 `read` 的路径校验遗漏，或目录符号链接改变解析根 | 可能读取固定 `mai-specs` 树之外的内容 | 完整相对路径白名单、条目名称检查、`listing.path` 等值检查；不向前端暴露路径输入框 | 构造 `../`、绝对路径、符号链接及伪造 Remote 条目测试 |
| 使用 `search` 或误接 Host 命令服务 | 违反无子进程约束 | 只注入并调用 `list/read`；静态依赖审查禁止 `search`、subprocess、shell、LLM、credentials | 无 Key 真实组合中对 `search` 和通用子进程设置观察，完整浏览不得调用 |
| 大目录触发 `truncated`，或外部修改导致分页版本变化 | 不完整树/混合版本被误认为最新内容 | 显式失败并保留旧完整内容，提供 Retry；不自动拼接或无限重启 | 故障注入截断、第二页版本变化和无效进度 |
| 刷新、快速选择、tab 关闭和卸载发生竞态 | 旧正文覆盖新选择，关闭一个 tab 停掉其他 pane，卸载后仍更新或自有任务残留 | 两路 AbortController + generation + 任务跟踪 + `tab.signal` 只触发 `releaseTab` + `disposeFace` 等待式清理 | deferred Remote promise 乱序完成；双 pane 关闭其一后另一 tab 仍可读取；启用/禁用及 tab 关闭时断言清理在读取 settle 前保持 pending |
| Raw JS 绕过部分正式包静态检查 | 字典缺键、硬编码文案、CSS 污染或依赖漂移未被发现 | 显式 `checkJs`、唯一根作用域、字典键测试、源码审查和真实 Web AC；不声称根门自动覆盖 | 插件 tsc、现有 Web e2e、中英文及两主题实页检查 |
| `plugins/` 不在 workspace，`tsc` 无法解析平台模块类型 | checkJs 验收不可执行，或静默降级后失去类型保障 | 插件 tsconfig 用 `paths` 指向 `packages/*/src` 入口并在仓库根执行；否则收窄为本地字典键检查并登记降级 | T8 实际执行 `tsc -p`，记录解析配置或降级结论 |
| 窄面板、长路径或刷新替换 DOM | 焦点丢失、操作不可达、页面横向滚动 | 稳定 key 和控件、单栏内部滚动、可见区域导航、390 px 主验收 | 键盘-only、宽窄切换、长路径、中英文和焦点断言 |

## 4. 兼容性考量

本方案不修改现有 Remote、Session、持久化、SDK、CLI、profile 或其他插件代码路径，无数据迁移和发版顺序要求。新增 `kind: mai-sdd-documents` 与包名身份，不能复用或覆盖现有 `files`/Markdown viewer kind。

插件依赖的 Cordis、Slot、Remote 和动态模块 API 均为当前基线的 pre-stable 接口；只承诺在本文代码基线上验证。后续 DSH 升级需重新核对接口，不假设旧插件自动兼容。禁用插件时由注册 disposer 恢复原有 Sidebar，既有文件导航、通用 Markdown 预览和插件管理行为作为 AC-11 回归范围。

## 5. 任务分解

| 任务 | 关联模块/决策 | 变更文件（新增/修改/删除） | 前置依赖 | 交付物与验收条件 |
| --- | --- | --- | --- | --- |
| T1 插件清单与 Host companion | Raw JS 动态包；FR-07 | 新增 `plugins/mai-sdd-doc-viewer/{package.json,cordis.patch.yml,index.js,icon.svg}` | 设计评审通过 | 包清单、Cordis patch 和图标三项必备文件及额外 Host companion 可用，包能被 Loader 识别；无构建步骤或额外安装依赖，无官方身份冒用。 |
| T2 注册、字典、store 与生命周期 | 独立 page；Session store + face | 新增 `plugins/mai-sdd-doc-viewer/client.js`、`tsconfig.json` | T1 | AC-01、AC-11；zh/en 字典含 COPY-01 至 COPY-10 及全部附加 chrome；在仓库根执行插件 `tsc -p` 通过，或按 2.3.4 登记的降级方案；卸载撤销注册、关闭 face 准入并等待已接纳读取 settle，`releaseTab` 不影响其他 tab。 |
| T3 Feature 发现与目录状态 | 递归 `list`、路径与排序 | 修改 `client.js` | T2 | AC-02、AC-05、目录侧 AC-06；完整过滤/排序/空态，截断和符号链接不生成不完整树。 |
| T4 文档分页与刷新竞态 | 完整分页、两路 generation | 修改 `client.js` | T3 | AC-03/04/06/07/08 的读取部分；同名路径独立、版本一致、取消和删除选择语义符合 2.3.3。 |
| T5 面板、Markdown 与响应式 UI | 复用 primitive、作用域样式 | 修改 `client.js`、`icon.svg` | T4 | AC-03、AC-09；只读渲染、所有状态与重试、键盘/焦点/390 px/中英文可用；无编辑保存执行入口。 |
| T6 真实 Web 集成与故障注入 | 现有 `apps/web` 测试 include | 新增 `apps/web/tests/mai-sdd-doc-viewer.e2e.ts` 及 `expected/mai-sdd-doc-viewer/` 基线 | T5 | AC-01 至 AC-09、AC-11；使用确定性 fixture、deferred Remote、无 Key 组合、启用/禁用和文件快照；断言刷新立即取消并重读文档、双 pane 关闭其一后另一 tab 仍可重读、卸载等待 deferred 读取 settle；观察无 search/子进程/LLM/凭据/Session 注入。 |
| T7 插件说明与课程交付 | BR-04、BR-07、FR-08 | 新增插件 `README.md`、`README.zh.md`；修改根 `README.zh.md`；保留 Feature 全部实际产物 | T5 | AC-10；说明安装、只读限制、无模型副作用；根目录含课程作业段落；不执行 Git 提交。 |
| T8 最终窄范围检查与实页评审 | 全部 | 仅修复上述授权文件 | T6、T7 | 仓库根执行插件 tsc（或登记降级）、keyless Web e2e、Markdown 链接/格式检查、静态清单和依赖检查通过；检查两主题及关键状态，记录未覆盖项。 |

AC 与实现/验证任务的对应关系：AC-01→T1/T2/T6；AC-02→T3/T6；AC-03→T4/T5/T6；AC-04→T3/T4/T6；AC-05→T3/T6；AC-06→T3/T4/T6；AC-07→T4/T6；AC-08→T3/T4/T6；AC-09→T2/T5/T6；AC-10→T1/T7/T8；AC-11→T2/T6。

实现阶段的最小验证入口为插件 `tsc -p`、目标 `vitest.web.config.ts` 单文件 keyless replay、相关 Markdown/格式检查和真实页面检查。不得只以 Raw JS fixture 可运行、源码关键词或静态路径存在代替 AC；也无需默认运行全仓测试。非平凡的可见 UI 变更保留 keyless 可访问结构基线，GUI 交付按仓库要求准备实际交互 GIF 和设计/产品评审证据。

当前尚无业务测试计划产物。本文已识别目录失败、分页版本、乱序响应、删除选择和无副作用等验证缺口；建议设计评审后由独立测试计划阶段展开业务验收场景，不在本阶段自动创建。
