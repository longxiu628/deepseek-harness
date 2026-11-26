# mai-sdd-doc-viewer

[English](README.md) | 中文

只读浏览当前 Session 工作区 `mai-specs` 下 SDD 规格 Markdown 的 DSH Web 右侧 Sidebar 插件，供 `my-ai-infra` SDD 课程作业使用。

## 功能

- 在右侧 Sidebar 引导入口新增“SDD 文档”页面。
- 按 `mai-specs/NNN-slug/` Feature 目录递归列出小写 `.md`，Feature 优先于文件、同级按名称自然升序。
- Feature 层默认展开，更深目录默认折叠；空 Feature 显示说明。
- 选中文档后显示完整工作区相对路径与渲染结果，同名文档按完整路径区分。
- 支持“重新读取”，以便外部编辑、新增或删除文档后刷新；所选文档被删除时给出明确提示。
- 无工作区、无 `mai-specs`、无 Markdown、读取失败与删除选择各有独立状态与重试入口。

## 约束

- 只读：仅调用 `remote.workspaceFiles.list` 与 `remote.workspaceFiles.read`，不使用 `search`，不写任何文件。
- 无子进程：不执行 `mai`、SDD 命令、Git 或其他进程。
- 无模型副作用：不发起模型请求、不读取 LLM API Key 或凭据、不写入 Session 事件，浏览内容不进入提示词或工具参数。
- 不使用固定假数据或内置样例文档，所有内容来自当前工作区。

## 文件

| 文件 | 说明 |
|---|---|
| `package.json` | 动态 Host+Client 包清单、图标与 bundle patch |
| `cordis.patch.yml` | 将本插件插入 DSH 组合 |
| `index.js` | Host 伴生入口，`apply` 为空 |
| `client.js` | 全部浏览器行为：注册、目录发现、分页读取、状态与 UI |
| `icon.svg` | 非官方课程插件图标 |
| `types.d.ts` | React、client store 与 UI primitives 的最小本地声明，仅用于 `checkJs` |
| `tsconfig.json` | `allowJs`/`checkJs`/`noEmit` |

## 检查

在仓库根目录执行：

```sh
node_modules/.bin/tsc -p plugins/mai-sdd-doc-viewer/tsconfig.json
```

`plugins/` 不属于 pnpm workspace，仓库根也没有 `@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-primitives` 的可解析副本，因此类型检查使用 `types.d.ts` 的最小声明，覆盖本插件自身代码的字典键、组件属性与 store action 签名，不覆盖被复用包内部实现。

浏览器验收见 `mai-specs/999-mai-sdd-doc-viewer/test/TEST_PLAN.md`。
