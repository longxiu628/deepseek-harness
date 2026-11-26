# 技术设计评审：999-mai-sdd-doc-viewer

> 评审对象：[TECH_DESIGN.md](../design/TECH_DESIGN.md)（草案） | 有效需求来源：[PRD.md](../spec/PRD.md)（草稿） | Profile：standard | 首轮结论：**需要修改** | 复评结论：**通过**（2026-11-25）

## 1. 首轮评审结论（已处理）

复评结果：首轮 4 项发现均已在设计中落实，结论改为**通过**，逐项复核证据见第 8 节。以下保留首轮判断作为历史记录。

方案的核心方向成立：只读边界、无 LLM/无 API Key/无子进程/无写操作的约束有明确落点，目录发现与分页读取的失败语义、取消与 generation 防护、等待式销毁也已写入设计。评审未发现 P0。

发现 2 项 P1：一是 face 生命周期按 Session 建立，却被单个 tab 的 `signal` 触发整体销毁，同一 Session 多 pane 场景下会永久停掉另一个 tab 的读取能力；二是 `plugins/` 不参与 workspace 模块解析，`client.js` 若引用平台模块类型，T2/T8 声明的 `tsc -p` 验收无法执行。两项都可在设计文本内定点修正，不需要推翻“Raw JS 动态包 + 复用 Sidebar/Remote/primitive”的架构。

另有 2 项 P2：分页尾部空页会引入多余换行；根目录或 Feature 目录本身是符号链接时的失败映射未写明。修完 P1 并重新自检后建议复评，即可进入测试计划与实现。

## 2. 评审依据与范围

依据：PRD 的 FR-01 至 FR-08、BR-01 至 BR-07、NFR-01 至 NFR-04、AC-01 至 AC-11；设计第 1 至 5 章及其中供评审的代码示意；实际代码基线的 Sidebar 注册、Slot 契约、`workspaceFiles` Remote、Cordis effect、client store、Markdown primitive 与 Web 测试脚手架。

范围：本次只核对设计是否覆盖需求与硬约束、并发与销毁语义是否自洽、接口使用是否与现有代码一致，并给出可执行动作。未评审实现代码（尚不存在），未运行编译、浏览器或 AC 验证，不评价 PRD 的业务取舍。

## 3. 关键发现

### P1-1：Session 级 face 与 tab 级 `signal` 的销毁粒度不一致

**证据**：设计 2.3.1 用 `handle.create(scopeKey)` 为每个 Session 建立一个 face，并把 `instance.actions` 映射到该 face；2.1.1 说明 store 是 Session scope，状态按 `tab.id` 分区。设计 2.3.3 又规定“`tab.signal` 的首次读取注册一次性 abort 监听，回调同步启动该 face 的幂等 `dispose()`”。但 `sidebar.right.pane.tab` 的契约明确写着同一 key 的注册“receives every tab of that kind, in every pane”（[slots.ts](../../../packages/client/ui-sidebar-right/src/client/contract/slots.ts#L52-L64)），而 `signal` 是“tab occurrence lifetime”（同文件第 48 行、[tab-info.ts](../../../packages/client/ui-sidebar-right/src/client/tab-info.ts#L29-L55)）。store 每 Session 一个实例的既有范式见 [store.ts](../../../packages/client/ui-sidebar-files/src/client/store.ts#L304-L311) 与其注释。

**触发条件**：同一 Session 在两个 docked pane 各打开一次本插件页面（kind 相同，`tab.id` 不同），然后关闭其中一个 tab。

**影响**：关闭行为会 dispose 该 Session 的整个 face，`dispose()` 中“停止接纳新任务”成为永久状态，另一个 pane 仍挂载的 tab 无法再选择文档、重试或重新读取；同时 `dispose()` 里 `actions.forget(tabId)` 的 `tabId` 归属在一个多 tab 的 face 中不唯一，可能出现该忘记的记录未忘记、不该忘记的被清掉。这与 2.1.1“按 `tab.id` 隔离”和 BR-06“未选择或读取失败不得影响其他面板”不一致。

**动作**：把销毁拆成两级。`releaseTab(tabId)` 由 `tab.signal` 触发，仅 abort 并等待该 tab 的 tree/document channel，然后 `actions.forget(tabId)`；`disposeFace()` 只在插件卸载时由 `disposeFaces()` 调用，先关闭 face 级准入闸，再等待全部 tab 的已接纳任务，最后释放监听与记录。任务集合按 tab + channel 登记，准入闸保留在 face 级。验收补一条 Web 用例：两个 pane 各开一页，关闭其一后，另一 pane 仍能重读并显示新内容。

### P1-2：`tsc -p plugins/mai-sdd-doc-viewer` 缺少平台模块解析方案

**证据**：设计 2.3.4 写明 `en` 用 `Record<keyof typeof zh, string>` 约束且“type-only import 不产生运行时依赖”；T2、T8 以插件 `tsc -p` 通过作为交付条件。实际检查显示仓库根 `node_modules/@deepseek-ai/dsh-client-store` 与 `node_modules/@deepseek-ai/dsh-client-ui-primitives` 均不存在，`plugins/` 也不在 `pnpm-workspace.yaml` 中；动态模块表只在浏览器运行时提供这三个模块（[platform.ts](../../../packages/client/web/src/platform.ts#L8-L15)）。

**触发条件**：实现 T2 时在 `client.js` 写 `@type {import('@deepseek-ai/dsh-client-ui-primitives').MarkdownTextProps}` 一类 JSDoc 引用，或在 `tsconfig.json` 中开启 `checkJs` 后运行 `tsc -p`。

**影响**：类型解析失败会让 T2/T8 的声明验收无法执行；若为绕过错误而删除平台模块类型引用，就只剩本地字典键检查，`t()` 键推断与 primitive props 的正确性失去静态保障，而设计把这一点列为 Raw JS 方案的主要风险缓解。

**动作**：在插件 `tsconfig.json` 用 `compilerOptions.paths` 把 `react`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-primitives` 指向 `packages/*/src` 的实际入口，并写明命令在仓库根执行；若决定不引入跨包类型，则把 T2 收窄为“本地 JSDoc 字典键检查”，在 T8 明确记录该覆盖降级，不再声称完整 `checkJs`。

### P2-1：分页尾部空页会在正文末尾多出一个换行

**证据**：[types.ts](../../../packages/api/workspace-files/src/types.ts#L51-L65) 允许 `lines: 0` 的页存在（`offset` 越过最后一行时 `text` 为空）；设计 2.3.3 的 `readWholeDocument` 在 `page.eof` 时无条件 `parts.push(page.text)` 再 `join('\n')`，而进度检查只拒绝“未 EOF 且 0 行”。

**触发条件**：某页恰好在文件末行处返回空页且 `eof` 为真，或后续页返回 `lines: 0`。

**影响**：渲染文本末尾多一个换行，Markdown 语义基本不变，但属于内容保真偏差，也会让基于全文比较的测试基线出现难以解释的差异。

**动作**：拼接前跳过 `lines === 0` 的页，或在 2.3.3 明确“空尾页不参与 join”。

### P2-2：根目录或 Feature 目录自身是符号链接时的映射未写明

**证据**：`list` 会跟随最终目录符号链接，并返回解析后的相对路径（[index.ts](../../../packages/api/workspace-files/src/index.ts#L342-L368)）；设计 2.3.2 只用 `listing.path === 请求路径` 检查，并把子目录符号链接与截断统一映射到 COPY-08，但没有说明根 `mai-specs` 或 Feature 目录本身为链接时的预期。

**影响**：该检查会同时命中这些情况并显示 COPY-08；行为本身符合 BR-01“固定根、不越界”，但设计未声明，测试容易把“根目录为链接”误判为“缺少根目录”或实现缺陷。

**动作**：在 2.3.2 与风险表补一句映射约定，并在 AC-05/AC-06 相关用例中固定为 COPY-08，确认不跟随链接。

## 4. 已核验成立的部分

- 只读边界：设计只注入并调用 `list`/`read`；`search` 确认会要求 subprocess provider（[index.ts](../../../packages/api/workspace-files/src/index.ts#L384-L405)），禁用理由成立。
- 路径限制：`read` 明确接受绝对路径且允许工作区外文件（同文件第 264-278 行），因此设计 2.3.2 的 `isSddDocumentPath` 白名单与条目名检查是必要补偿，且已给出完整实现。
- Sidebar 使用：注册字段 `id`/`kind`/`title`/`guide`、body/title 以 definition `id` 为 key、`store` 与 `inject(sessionId, actions)` 的用法与 [tab-registry.ts](../../../packages/client/ui-sidebar-right/src/client/tab-registry.ts#L93-L139) 和 [ui-sidebar-files](../../../packages/client/ui-sidebar-files/src/client/index.ts#L114-L128) 的既有实现一致，含 `WeakMap<actions, face>` 的 face 绑定方式。
- 异步销毁：Cordis 的 `Effect` 与 disposer 支持 async，且卸载会等待其完成（[fiber.ts](../../../vendor/cordis/src/fiber.ts#L98-L120)），设计 2.3.3 的 `ctx.effect(() => async () => { await disposeFaces() })` 形式可用。
- 取消信号：`AbortSignal.any` 在仓库 Client/Host 多处已是既有用法，不属于新基线风险。
- cwd 选择：`selectSessionDirectory` 源码明确要求 Client 插件内联，且静态模块表不含该 row（[directories.ts](../../../packages/api/session-controller/src/client/sessions/directories.ts#L1-L30)），设计的内联决定有依据。
- 测试接入：`launchWebScaffold` 支持 `extraInstallAnchors`（[scaffold.ts](../../../apps/web/tests/scaffold.ts#L325-L335)），与 `client-plugin-live.e2e.ts` 的本地包加载路径一致。
- Markdown 复用：`MarkdownText` 的 `text/streaming/labels/fileMentions/pathImages/omitHtml` 属性与设计一致（[MarkdownText.tsx](../../../packages/client/ui-primitives/src/markdown/MarkdownText.tsx#L189-L200)），`MarkdownLabels` 由 `code.copyLabel`、`code.copiedLabel`、可选 toolbar 文案与 `footnotes` 组成（[render.tsx](../../../packages/client/ui-primitives/src/markdown/render.tsx#L39-L53)），设计新增的字典键可覆盖。
- 需求覆盖：AC-01 至 AC-11 在设计的验收映射中均有对应任务，未发现遗漏的 AC 编号；COPY-01 至 COPY-10 未在设计中另建真源。

## 5. 待验证事项

- Raw JS 中 `t()` 的键推断与 `inject` 的精确签名未经运行验证；设计已提示实现时核对。
- 真实 `read` 在超过 `maxLines` 文档上的分页、`version` 稳定性与空尾页行为未实测（与 P2-1 相关）。
- 390 CSS px、窄面板单栏导航、两主题与中英文实页效果未验证，属实现阶段验收。
- 插件 `tsconfig.json` 的模块解析能否成立，取决于 P1-2 的修正。
- 双 pane、tab 关闭、插件禁用/启用的真实生命周期未验证，取决于 P1-1 的修正。

## 6. 处置建议

**本次必须补齐**：P1-1 的 `releaseTab`/`disposeFace` 拆分与对应验收；P1-2 的类型解析方案或明确的覆盖降级记录。

**可以延后**：P2-1 的换行处理可在实现时一行修正；P2-2 的映射说明可随 2.3.2 一并补齐，不单独扩大范围。

**保持现状**：Raw JS 动态包、独立 `kind`/page、只注入 `list`/`read`、Session store + tab 分区、完整分页与版本一致性、跳过 `search`、不引入部署配置。这些都有现有代码或约束依据，不建议为“更完整”而增加构建链、并发池或新 Host 接口。

## 7. 首轮下一步（已完成）

首轮建议修改 [TECH_DESIGN.md](../design/TECH_DESIGN.md) 的 2.3.1、2.3.3、T2、T8 与风险表落实两项 P1，然后复评。该动作已由作者完成，复评结论见第 8 节。本次评审不改 PRD、设计、BRIEF 的结论、Phase 与 ROADMAP，也不产生代码变更。

## 8. 复评记录（2026-11-25）

**P1-1 已解决。** 设计 2.1.2 把“tab 关闭”和“插件卸载”拆成两行，明确 `releaseTab(tabId)` 只结束所属 tab、face 继续接纳其他 tab；2.1.2 末段新增两级所有权说明，2.3.1 定义 `open/select/reload`、`releaseTab`、`disposeFace` 三级操作，2.3.3 的释放步骤改为“标记该 tab 已释放 → 等待该 tab 两路任务 → 只忘记该 tab”，并规定 `disposeFace()` 先关 face 准入闸再逐个 `releaseTab`。风险表补充“关闭一个 tab 停掉其他 pane”的影响，T2 与 T6 增加 `releaseTab` 隔离和双 pane 关闭用例。与 `sidebar.right.pane.tab` 接收所有 pane 中同 kind tab 的契约一致，首轮缺陷已消除。

**P1-2 已解决。** 设计 2.3.4 明确 `plugins/` 不参与 workspace 安装、仓库根没有两个平台模块的可解析副本，要求 tsconfig 用 `compilerOptions.paths` 指向 `packages/client/*/src` 入口并在仓库根执行 `tsc -p`；如果放弃跨包类型，则 T2 收窄为本地字典键检查并在 T8 登记降级。文件清单、T2、T8 与风险表同步更新，验收不再依赖无法执行的隐式解析。

**P2-1 已解决。** 2.3.3 规定 `lines === 0` 的空页不参与 `join('\n')`，代码示意同步改为 `if (page.lines > 0) parts.push(page.text)`，尾部多余换行不再产生。

**P2-2 已解决。** 2.3.2 补充根 `mai-specs` 或 Feature 目录自身为目录符号链接时，`listing.path` 等值检查失败映射到 COPY-08、不跟随链接改变固定根，与“只读取固定树”的约束一致。

**复评执行的检查**：Feature 产物校验 `valid: true`、`issues`/`warnings` 为空，已登记 `prd`、`design`、`design-review`；五份 Feature Markdown 的相对链接、结尾换行、尾随空白、`js` 代码块语法与 AC-01 至 AC-11 引用全部通过；变更范围仍仅 `mai-specs/999-mai-sdd-doc-viewer/`，Phase 与 ROADMAP 未变。P1 与 P2 均关闭，未发现新增阻断项。

**复评结论：通过。** 设计可作为测试计划与实现的输入。仍未执行编译、浏览器与 AC 运行验证；这些属于后续阶段，不能以本次文档一致性检查替代。建议下一步执行 `/my-create-test-plan` 补齐 AC-01 至 AC-11 的业务验收场景，再进入实现。
