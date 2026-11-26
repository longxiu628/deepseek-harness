# my‑ai‑infra SDD课程作业约束（郭美青老师 作业一）
1. 当前仓库：Fork后的DeepSeek‑Harness(DSH)，已执行 mai init，选题：mai‑sdd‑doc‑viewer DSH插件；功能：在DSH Web界面浏览根目录 mai‑specs 下各个Feature的SDD规格Markdown文档预览；仅前端展示，不执行SDD命令，不需要LLM API Key。
2. DSH插件源码放置于 plugins/mai‑sdd‑doc‑viewer/，严格遵守DSH + Cordis插件规范，必备文件：package.json、cordis.patch.yml、client.js、icon.svg、README.zh.md、README.md。
3. 编码开发跟随 my‑ai‑infra SDD原生流程阶段推进，按照工具输出的规约文档开展编码；作业要求完整保留该feature全部SDD中间产出物，随插件代码一并提交版本库。
4. 用户会在Trae中手动执行mai命令完成每个SDD阶段，完成后主动汇报进度；我等待用户告知完成，再给出下一步操作指引与作业校验点。
5. 需要修改仓库根目录README.zh.md，增加作业说明段落，格式参考样例Fork仓库。
