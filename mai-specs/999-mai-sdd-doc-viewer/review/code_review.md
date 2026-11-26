# 代码评审：999-mai-sdd-doc-viewer

> 审查对象：`plugins/mai-sdd-doc-viewer/` 与 `apps/web/tests/mai-sdd-doc-viewer.e2e.ts` | 需求：[PRD.md](../spec/PRD.md) | 设计：[TECH_DESIGN.md](../design/TECH_DESIGN.md) | 测试计划：[TEST_PLAN.md](../test/TEST_PLAN.md) | 设计评审：[design_review.md](design_review.md) | 首轮结论：修改后重新审查 | 复评结论：**通过**（2026-11-25）

## 1. 总体结论

复评结果：两项 P1 均已在实现中关闭，并补了子目录消失回归；逐项证据见第 8 节。以下保留首轮判断作为历史记录。

只读边界、Sidebar/Remote 接入、分页与版本一致性、`releaseTab`/`disposeFace` 的销毁粒度与等待式清理总体符合设计与 PRD，未发现 P0，也未发现越权的 `search`、子进程、模型或凭据访问。

发现 2 项 P1：目录发现把任意子目录的 `not-found` 误判为“未找到 mai-specs”，会把 COPY-08 显示成 COPY-05 并清空选择；切换 cwd 与根目录消失这两条状态重置路径没有使 document generation 失效，旧读取可在重置后写入正文。两项都在 `client.js` 内、修复面很小，但都属于 PRD AC-05/AC-06 与设计并发约束的可复现偏差，建议修复并复评后再合并。

另有 3 项 P2：`types.d.ts` 类型声明需要登记为静态检查口径的偏差；卸载期间新建 Session store 的窄竞态；e2e 未覆盖失败注入、三类空态、窄屏与中英文。本轮按要求未修改仓库根 `README.zh.md`。

## 2. 范围与证据

比较对象：当前工作区未提交变更。`git status` 显示新增 `plugins/mai-sdd-doc-viewer/`、`apps/web/tests/mai-sdd-doc-viewer.e2e.ts`，以及 `tsconfig.host.json` 的 `include` 与 `apps/web/tsconfig.json` 的 `exclude` 各一行接线；其余 `.gitignore`、`AGENTS.md` 类型变化、`CLAUDE.md`、`.my-ai-infra.json`、`.trae/` 为仓库既有环境状态，非本 Feature 修改。`mai-specs/999-mai-sdd-doc-viewer/` 下 PRD、设计、评审、测试计划未改动。

已执行：

- `node --check plugins/mai-sdd-doc-viewer/client.js`：通过。
- `node_modules/.bin/tsc -p plugins/mai-sdd-doc-viewer/tsconfig.json`：通过。
- `node_modules/.bin/oxlint plugins/mai-sdd-doc-viewer apps/web/tests/mai-sdd-doc-viewer.e2e.ts`：0 warning / 0 error。
- 临时 Node 冒烟（Loader 协议 + 虚拟 `list`/`read`）：目录过滤与自然序、三页分页拼接、选中、刷新更新、新增文档、删除选择转 missing、单 tab 中止只释放自身、卸载清理等待后忘记状态，全部通过。脚本位于系统临时目录，已删除，未写入仓库。
- `pnpm run typecheck`：`run-gates: 5 passed, 0 failed, 0 skipped in 211.95s`（Host Typert、host/client compiler、host/client aggregate check 全通过）。

未执行：真实浏览器 e2e、可见 UI 与 390 px 布局检查、真实 Remote 故障注入。

## 3. 关键发现

### P1-1：子目录读取失败被误判为“未找到 mai-specs”（阻断）

证据：[client.js](../../../plugins/mai-sdd-doc-viewer/client.js) 第 758-765 行仍按 `workspace-file/not-found` / `not-directory` 判断 `treeMissingRoot`，而 `discoverTree`（第 440-485 行）只把**根** `mai-specs` 的该错误转成 `missingRoot` 标志；子目录遍历返回的失败保留原始错误码。

触发条件：`mai-specs` 存在，但某个嵌套目录在父目录列举与子目录列举之间被删除、改名或权限变化（用户或外部工具并发改动、外部编辑器重命名）。

影响：整个树被替换为 COPY-05“未找到 mai-specs”，`features` 与选中/正文被清空。PRD AC-06 明确“读取失败不得显示为空态”，设计 2.3.2 要求子目录消失映射 COPY-08；当前实现会把可重试故障伪装成“没有规格目录”，并丢失用户选择。

最小修复：删除 758-765 行的错误码分支，只保留 `result.value.missingRoot === true` → `treeMissingRoot`；其余 `!result.ok` 一律 `treeFailed`。`discoverTree` 已经区分了根缺失，无需在调用方再看错误码。

复验：在冒烟或 e2e 中让 `999-alpha/spec` 在列举父目录后消失，断言 `treeStatus === 'error'`、`treeFailure` 保留子目录错误码、刷新场景下旧 `features` 仍可见且显示 COPY-08 + COPY-09，且选中不被清除。

### P1-2：状态重置未使 document generation 失效，旧文档可写入新状态（阻断）

证据：`open()`（第 824-832 行）在 cwd 变化时调用 `visited` 重置状态并启动新树，但没有取消或递增 document channel；`treeMissingRoot` 分支（第 766-768 行）清除选择与正文时同样没有取消并发的文档读取。而 `usable` 只比较 `tab[kind].generation` 与请求代号，重置路径没有递增该值。`reload()`（第 857-865 行）会并行启动树与文档读取，正落在该分支上。

触发条件 A：Session 的 projected workingDirectory 在文档读取未完成时改变。旧读取 settle 后通过 `usable` 检查，把上一个工作区的正文写入 `documentReady`，此时 `selectedPath` 已为 `undefined`。

触发条件 B：点击“重新读取”后根目录消失或变为非目录；`reload` 已启动文档读取，树读到 missing-root 后清空选择与正文，文档读取随后 settle 并写入正文。

影响：预览显示无选中来源的旧正文，甚至跨工作区内容；树处于 COPY-05 时预览仍有内容，违反设计 2.1.2“切换工作区时完全重置状态并重新读取”与 2.3.3“旧请求不能覆盖新状态”，也使 AC-05/AC-08 的状态语义不可信。

最小修复：在 `open()` 的 `visited` 之前调用 `cancelDocument(tab)`；在 `treeMissingRoot` 分支后调用 `cancelDocument(tab)`。更稳妥的做法是把“重置状态”收敛为 face 内的一次操作，同时递增 tree/document 两个 generation 并 abort 两个 controller，避免以后再次遗漏。

复验：用 deferred 的 `read` 复现两条路径，断言 cwd 切换或 missing-root 之后 `document.status` 不会变为 `ready`、`document.text` 不出现旧正文，且清理 Promise 在旧读取 settle 前保持 pending。

## 4. 降级与偏差登记

### P2-1：`types.d.ts` 替代设计中的 `paths` 指向 `packages/*/src`

设计 2.3.4 与复评记录给出的两种口径是：`paths` 指向 `packages/client/*/src`，或收窄为本地字典键检查。实际实现采用第三种：插件内 [types.d.ts](../../../plugins/mai-sdd-doc-viewer/types.d.ts) 声明 `react`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-primitives` 的最小类型，并由 [tsconfig.json](../../../plugins/mai-sdd-doc-viewer/tsconfig.json) 的 `include` 纳入。

运行时不受影响：`client.js` 通过 `factory(require)` 取得真实平台模块，`types.d.ts` 不参与打包、不被 `require`、不在 `package.json` 的 `exports` 中；删除它只会让 `tsc` 失败，不会改变浏览器行为。`tsc -p` 通过证明当前代码与声明一致，覆盖字典键、`MarkdownText` 属性名与 store action 调用。

残余风险：声明是手写副本，真实 primitive 若重命名 `omitHtml` 或 `MarkdownLabels` 字段，静态检查不会报错，运行时也不会报错（多余属性被忽略），只能靠 e2e 与实页发现。该风险非阻断，处理建议：在 `types.d.ts` 顶部注明每个声明的真实来源文件，作为下次设计同步时把口径改写为“本地最小声明”的依据；插件若并入 workspace，再改为 `paths`。

### P2-2：卸载期间新建 Session store 的窄竞态

证据：`disposeFaces()`（第 972-977 行）先快照 `owned` 再 `await`；`store.create`（第 944-952 行）没有卸载闸。Cordis 的兄弟 disposer 并发执行，若 slot 注册的清理晚于快照，且此时有新的 Session store 实例被创建，该 face 不在快照内，`admitting` 仍为真，其读取可在插件卸载后继续。

影响：窄窗口内可能留下未等待的自有异步任务，削弱本次实现的“销毁达到静默”保证。发生概率低，但属于同一类生命周期缺陷。

建议：`createStoreAndFaces` 增加 `closed` 标志；`disposeFaces` 先置位再快照；`create` 在 `closed` 时创建 face 后立即 `void face.dispose()` 并仍登记映射，避免 `injectFace` 抛错。

### P2-3：e2e 与验收覆盖缺口

`apps/web/tests/mai-sdd-doc-viewer.e2e.ts` 的测试接线与 [client-plugin-live.e2e.ts](../../../apps/web/tests/client-plugin-live.e2e.ts) 一致：`workspaceRegistry.create` + `attachSession` + `seedSession` + `rename` + `loader.create/remove`，并通过 `extraInstallAnchors` 安装本地包，未使用 API Key。覆盖发现、排序、默认展开、空 Feature、同名路径选择、Reload 更新与新增、禁用/启用。

缺口：没有 Remote 失败注入（TC-06、P1-1 的回归用例），没有无工作区/无根目录/无 Markdown 三环境（TC-05），没有 390 px 与中英文断言（TC-09），未核对根 `README.zh.md`（TC-10，按本轮要求延后）。这些属于业务验收缺口，不重复列入阻断项，但 P1 修复需要至少补一个失败注入用例。

## 5. 已验证成立的部分

- 只读边界：`inject` 仅 `slots`、`locale`、`sidebarRightTabs`、`remote`、`remote.workspaceFiles`；代码只调用 `remote.workspaceFiles.list/read`，无 `search`、无 `fetch`、无写文件、无模型或凭据访问。
- 路径限制：`isSddDocumentPath`（第 339 行）限定 `mai-specs/<三位编号>-<slug>/…/*.md`，拒绝空段、`.`、`..` 与工作区外绝对路径；选择只接受树中已发现的路径。
- 分页：`readWholeDocument`（第 488-506 行）逐页累加 `offset`，校验 `lines` 安全整数、非 EOF 正进度、首末页 `version` 一致，空页不参与拼接；部分页失败时丢弃本次结果。
- 并发防护：每次请求 abort 旧 controller 并递增 generation，settlement 前同时校验 `admitting`、`released`、`signal.aborted`、generation；刷新并行重读树与当前文档，树完成后不重复重启同一路径。
- 销毁粒度：`releaseTab`（第 891-912 行）只标记并释放该 tab，`disposeFace`/`disposeFaces`（第 915-926、972-977 行）关闭准入闸后逐个释放并等待；`tab.signal` 只触发 `releaseTab`，与设计复评结论一致。
- 清单与接线：`package.json` 的 `main`/`exports`/`dsh.bundle.patch`/`dsh.client.platform` 与 `fixture-live-client` 完全同构；`cordis.patch.yml` 的 insert 形状一致；Slot 以 slot 名为 `name`、definition id 为 `key`，与 `ui-sidebar-files` 一致。

## 6. 待验证事项

- 真实浏览器 e2e：引导入口、页签激活、`aria-current`、Reload 禁用态、禁用/启用后的页签记录行为均未在浏览器中执行。
- 真实 `workspaceFiles.read` 在超过一页的文档上的 `version` 稳定性与空尾页行为。
- `plugins/mai-sdd-doc-viewer` 的 `icon` 字段与 `./icon` 导出是否被 Loader 或插件面板消费，未找到消费点，当前视为无害元数据。
- AC-10 的根 `README.zh.md` 作业说明段落，按本轮要求留到评审通过后统一补充。

## 7. 首轮下一步（已完成）

首轮要求修复 P1-1 与 P1-2，并补一条“子目录消失 → COPY-08 且保留旧树/选中”的回归。该动作已完成，复评结论见第 8 节。

## 8. 复评记录（2026-11-25）

**P1-1 已关闭。** [client.js](../../../plugins/mai-sdd-doc-viewer/client.js) 第 758-766 行不再按错误码判断 `treeMissingRoot`：任何 `!result.ok` 一律走 `treeFailed`，只有 `result.value.missingRoot === true` 才进入 missing-root 并清空状态。`discoverTree` 本身只在根 `mai-specs` 返回 `not-found` / `not-directory` 时设置该标志，子目录遍历失败原样返回，因此子目录消失得到 COPY-08，旧 `features` 与 `selectedPath` 保留。

**P1-2 已关闭。** 第 826-828 行在 `visited` 前调用 `cancelDocument(tab)`，第 762-765 行在 missing-root 分支清除状态后同样调用；`cancelDocument` abort 当前 controller 并递增 document generation，旧任务 settle 时 `usable` 的 generation 比较失败，无法写入。复核了其余重置路径：`noWorkspace` 原本就同时取消两路，`reconcile` 在判定文档不存在时先 `cancelDocument`，`releaseTab` 与 `disposeFace` 递增两路 generation；未发现新的遗漏路径。`loadTree` 在第 751 行定义、`cancelDocument` 在第 799 行定义，前者只在 `createFace` 返回后调用，不存在暂时性死区。

**回归用例已补。** [mai-sdd-doc-viewer.e2e.ts](../../../apps/web/tests/mai-sdd-doc-viewer.e2e.ts) 第 196-211 行在 Reload 新增文档之后删除 `mai-specs/998-beta/design`，断言：`TECH_DESIGN_PATH` 节点仍存在且 `aria-current="page"`；树中出现一个 `role="alert"` 与 `Retry`；COPY-05 文案计数为 0；预览仍显示路径与旧正文标题。覆盖 TC-06 的失败路径与本次 P1 的行为预期。

**复评执行的检查**：`node --check` 通过；`tsc -p plugins/mai-sdd-doc-viewer/tsconfig.json` 通过；`oxlint` 0 warning / 0 error；`pnpm run typecheck` 为 `5 passed, 0 failed, 0 skipped in 293.10s`。另以临时 Node 冒烟复现两条 P1：cwd 变更时挂起读取，重置后 resolve，`document.status` 保持 `idle` 且 `text` 为空；子目录消失得到 `treeStatus: 'error'`、`treeFailure.code === 'workspace-file/not-found'`、`features` 与选中保留；真正移除 `mai-specs` 仍进入 `missing-root` 并清空。脚本位于系统临时目录，已删除。

**仍未关闭的非阻断项**：

- P2-1 的 `types.d.ts` 偏差仍按第 4 节登记，尚未改写设计口径。
- P2-2 的卸载期新建 Session store 窄竞态未修复，仍为后续触发项。
- 浏览器 e2e 未执行；TC-05 三类空态、TC-09 窄屏与中英文、TC-10 根 README 仍未覆盖，根 `README.zh.md` 按安排留到代码评审通过后统一补充。

**复评结论：通过。** 两项 P1 已关闭，未发现新增阻断项；代码评审范围内可进入交付收尾，上述非阻断项与未执行验证需在最终交付前处理或明确记录。
