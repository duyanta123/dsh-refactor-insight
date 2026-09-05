# Changelog

本文件记录 dsh-refactor-insight 的变更，遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

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
