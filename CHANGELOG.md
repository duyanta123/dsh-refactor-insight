# Changelog

本文件记录 dsh-refactor-insight 的变更，遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.2.0] - 2026-10-24

### 变更
- DSH 宿主兼容基线从 `0.1.5-rc.2` 迁移到 `0.2.1-rc.2`：`test/dsh-compat.test.mjs` 固定安装 `@deepseek-ai/dsh@0.2.1-rc.2` + 同版本 `@deepseek-ai/dsh-skill-filesystem`，CI compat job 步骤名与全部文档基线引用同步（Node >=22.19 要求不变，本机 Windows / Node 22.21 实测 `npm run test:compat` 通过）。
- 文档勘误：两处输出字段契约清单（`PLUGIN-MAINTENANCE.md` §5.3、开发计划 §10）按脚本实际输出重写——god-object 无 `lines` 字段、deep-nesting/long-function/god-object/high-coupling 补列 `threshold`、Go 接收者分支无 `class_lines`；开发计划 §9 用例数 25 → 27；`PUBLISHING.md` §5 安装验证的技能名改为 frontmatter `name`（`refactor-insight`，技能目录仍为 `refactor-runbook`）；awesome-dsh-plugin 收录分类按 upstream 实际修正为 `category: dev`（无「/ Code Review」子分类），开发计划 §7 同步。
- 测试补契约断言：god-object 不输出 `lines` 字段、Go 接收者分支无 `class_lines`（god-object 默认 `threshold` 为 10），用例数不变（27 例）。
- 规则 6（TODO/FIXME 密度）输出新增 `line` 字段（首个标记行号），兑现开发计划 §4「文件:行」定位承诺；脚本用法说明移除从未被解析的 `--all`（脚本本就恒跑全部规则，行为无变化）。
- 修正 python/node fixture 头注释（"Deep-plus-todo fixture" 字样）被大小写不敏感的标记模式误计为坏味道的问题；修正后各 fixture 的标记数即真实植入数。
- 测试从 25 例扩到 27 例：六条规则在三种语言 fixture 上改为精确值断言（长函数体 99/88/88 行、深嵌套 7/6/7 层、TODO 标记 1/2/2 处及首行号 7/2/5、上帝对象方法数 12/12/11、类体 38/49 行），补齐 node/go 的语言探测与 TODO 密度断言，并新增默认阈值用例（400 行 file-length、300 行类体 god-object，经临时目录构造，不再依赖降阈值触发）。
- 文档同步：开发计划补「v0.1.3 实际实现口径」注记（实际输出字段名、规则 4 类体行数语义、runbook 阶段 1 仅用 `--probe`/`--deps`、无 `--all`）并修正 §5/§6 原文；`PLUGIN-MAINTENANCE.md` §5.3 输出字段契约改为脚本实际字段；`PUBLISHING.md` npm 发布步骤对齐 tag 触发的 OIDC trusted publishing 工作流（`.github/workflows/publish.yml`），手动 `npm publish` 降为兜底；双语 README 移除不存在的 `evidence` 字段表述。

## [0.1.3] - 2026-09-11

### 变更
- DSH 宿主兼容基线从 `0.1.2-rc.1` 迁移到 `0.1.5-rc.2`：`npm run test:compat` 与 CI compat job 固定安装 `@deepseek-ai/dsh@0.1.5-rc.2` + 同版本 `@deepseek-ai/dsh-skill-filesystem`。上游 0.1.3~0.1.5 的破坏性变更（`SessionHandle`、异步 `agentLoop.create()`、Session format v2/v3、`ctx.agent` 移除、Inbox API 变更）均不涉及本插件使用的技能 provider 路径，插件代码零改动。
- 提示：DSH 宿主升级到 0.1.5 系后 Session format 迁移为 V3，不可逆；最终用户升级宿主前请备份会话日志。

## [0.1.2] - 2026-09-06

### 新增
- 固定 `@deepseek-ai/dsh@0.1.2-rc.1` 的 `npm run test:compat` 门禁及 Windows/Ubuntu Node 22.19 CI，覆盖隔离 profile 的 add、配置 dump 和有限时长启动。
- 文档将 Node 18/22 CI 明确为独立脚本回归，并单列最新 DSH 宿主的 Node >=22.19 要求。
- `prepublishOnly` 钩子：npm 发布前自动运行测试门禁。

## [0.1.1] - 2026-09-02

### 新增
- 脚手架：`package.json` + `cordis.patch.yml` + `plugin/index.js` + `.github/workflows/ci.yml`（ubuntu + windows × Node 18/22）。
- 复用 `scripts/arch-profile.mjs`（从 arch-doc 原样引入）：probe / scan / deps / entry 代码库扫描。
- `scripts/refactor-smell.mjs`：零依赖坏味道诊断器，实现六条规则（阈值可参数覆盖）：
  超长文件、深嵌套、TODO/FIXME 密度、长函数、上帝对象、高耦合模块（复用 `--deps-json` 入度/出度 + 环检测）。
- `test/refactor-smell.test.mjs`：CLI 契约测试（`node:test`，spawnSync 模式），覆盖 Python / Node / Go 三语言 fixture 与高耦合环检测。
- runbook `skills/refactor-runbook/SKILL.md` 与报告模板 `docs/refactor-plan-template.md`。
- 发布前完善：TypeScript 修饰符识别、花括号语言字符串/注释掩码、PowerShell UTF-16 BOM 容错、`PUBLISHING.md`、CI `npm pack --dry-run`。
