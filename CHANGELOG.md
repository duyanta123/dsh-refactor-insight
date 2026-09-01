# Changelog

本文件记录 dsh-refactor-insight 的变更，遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.1.1] - 2026-09-02

### 新增
- 脚手架：`package.json` + `cordis.patch.yml` + `plugin/index.js` + `.github/workflows/ci.yml`（ubuntu + windows × Node 18/22）。
- 复用 `scripts/arch-profile.mjs`（从 arch-doc 原样引入）：probe / scan / deps / entry 代码库扫描。
- `scripts/refactor-smell.mjs`：零依赖坏味道诊断器，实现六条规则（阈值可参数覆盖）：
  超长文件、深嵌套、TODO/FIXME 密度、长函数、上帝对象、高耦合模块（复用 `--deps-json` 入度/出度 + 环检测）。
- `test/refactor-smell.test.mjs`：CLI 契约测试（`node:test`，spawnSync 模式），覆盖 Python / Node / Go 三语言 fixture 与高耦合环检测。
- runbook `skills/refactor-runbook/SKILL.md` 与报告模板 `docs/refactor-plan-template.md`。
- 发布前完善：TypeScript 修饰符识别、花括号语言字符串/注释掩码、PowerShell UTF-16 BOM 容错、`PUBLISHING.md`、CI `npm pack --dry-run`。