# 999: mai-sdd-doc-viewer DSH 插件

| 项 | 值 |
|---|---|
| Phase | draft |
| Profile | standard |
| 优先级 | P1 |
| 负责人 | 待填 |
| 目标日期 | 待填 |
| 涉及子系统 | plugins/mai-sdd-doc-viewer、mai-specs、README.zh.md |

## 一句话描述

在 DSH Web 侧边面板浏览并预览 mai-specs 下各 Feature 的 SDD Markdown 规格文档

## 背景

本需求为 my-ai-infra SDD 课程作业：在 plugins/mai-sdd-doc-viewer 开发 DSH（Cordis）插件，并完整保留本 Feature 的 SDD 中间产物。插件仅提供前端 UI 展示，不执行 SDD 命令、不调用 LLM、不需要 API Key；交付时还需在根目录 README.zh.md 增加作业说明。

## 关键决策

- 采用无构建 Raw JS 动态客户端包，复用现有右侧 Sidebar、Remote、store 和 Markdown primitive，不修改其他功能插件。
- 仅通过 `workspaceFiles.list/read` 只读访问固定 `mai-specs` 树；禁用会启动子进程的 `search`，不接入 SDD 命令、LLM、凭据或写操作。
- Session 级 store 按 tab 隔离状态，目录和文档读取分别取消并校验 generation；不完整目录、混合版本和迟到响应不得作为有效结果。

## 上下文索引

- [素材索引](context/_INDEX.md)
- [产品需求文档（有效需求与验收维护源）](spec/PRD.md)
- [技术方案（草案，待评审）](design/TECH_DESIGN.md)
- [技术设计评审（复评通过）](review/design_review.md)
- [业务测试计划（仅规划，未执行）](test/TEST_PLAN.md)
- [代码评审（复评通过）](review/code_review.md)
