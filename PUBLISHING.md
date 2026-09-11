# Publishing

> 本文是 dsh-refactor-insight 的发布手册，结构遵循工作区顶层 docs/PUBLISHING-TEMPLATE.md 模板（该文件位于插件仓库之外，不在本仓库内）；其他插件仓库的 PUBLISHING.md 同构。

## 1. 命名与分发身份

- npm 包名：`dsh-refactor-insight`（与 GitHub 仓库名一致）。
- GitHub 仓库名：`duyanta123/dsh-refactor-insight`。
- exports 仅根路径（`./plugin/index.js`），无 bin 命令、无子路径导出。
- cordis.patch.yml 插件行 id/name 为 `dsh-refactor-insight`。
- README 双语：`README.md` 为英文、`README.zh-CN.md` 为中文，顶部互链；两者章节结构必须一致，改动描述时同步更新。

## 2. 发布前检查清单

1. 运行 `npm test`（`node --test test/refactor-smell.test.mjs`，当前 25 例，全绿）。
2. 运行三处语法检查：`node --check scripts/refactor-smell.mjs`、`node --check scripts/arch-profile.mjs`、`node --check plugin/index.js`。
3. 运行 `npm run test:compat`（DSH 0.1.5-rc.2 / Node 22.19+；临时 profile add、dump-config、启动 smoke test）。
4. 运行 `npm pack --dry-run`，确认包含 `plugin/index.js`、`cordis.patch.yml`、`skills/`、`docs/`、`scripts/`、双语 `README.md`/`README.zh-CN.md`、`CHANGELOG.md`、`PUBLISHING.md`、`LICENSE`。
5. 版本一致性核对：`package.json` version、`CHANGELOG.md` 发布段、git tag 三处一致。
6. 版本徽章同步：双语 README 的 version 徽章与安装示例 tag 指向最新发布版本。
7. `README` / `CHANGELOG` / `docs/refactor-plan-template.md` / `skills/refactor-runbook/SKILL.md` 已同步本轮变更。

## 3. DSH bundle 契约（对齐 2026-09 现行契约）

- `package.json` 声明 `dsh.bundle.patch: ./cordis.patch.yml`——harness 只激活声明该字段的包。
- `cordis.patch.yml` 为 config-tree `- insert:` 补丁格式；harness 加载 `main`（`plugin/index.js`）。
- `plugin/index.js` 经官方 `@deepseek-ai/dsh-skill-filesystem` 的 `FileSystemSkillProvider` 注册 `skills/` 为技能根（includeDefaultRoots: false）。
- `skills/refactor-runbook/SKILL.md` frontmatter 必填 `name`（kebab-case）+ `description`。
- 安装契约：`dsh plugin --profile <profile> add "github:owner/repo#ref"`；兼容基线 `@deepseek-ai/dsh@0.1.5-rc.2`（Node >= 22.19）。
- 红线：本包只发布只读诊断技能，不包含任何自动改码工具。

## 4. 发布渠道

### GitHub

1. push `main`，确认 CI 全绿（ubuntu + windows × Node 18/22 回归 + Node 22.19 DSH compat job）。
2. 打 tag `v0.x.y`（与 `package.json` version 一致，如当前 `v0.1.3`）并推送；可同时 `gh release create vX.Y.Z --title vX.Y.Z --notes "See CHANGELOG.md"`。
3. 给仓库添加 GitHub topic `dsh-plugin`（awesome 收录门槛之一）。

### npm

1. `npm login`（需要 npm 账号 + 2FA）。
2. `npm publish`（`prepublishOnly` 会先跑 `npm test`）。
3. 发布后核对 `npm view dsh-refactor-insight version` 与 dist-tags。

### awesome 列表收录（已收录，改描述时同步）

- awesome-dsh-plugin：同步 `data/plugins/duyanta123__dsh-refactor-insight.yml`（Git & Engineering / Code Review 分类）。
- awesome-deepseek-harness：同步 README 条目（真实仓库 + 一句话 + 链接，en/zh 同 PR）。
- Oh-My-DSH 自动同步。

## 5. 安装验证（发布后）

1. `dsh plugin --profile web add github:duyanta123/dsh-refactor-insight` 后重启 profile，技能列表应出现 `refactor-runbook`。
2. 说「用 refactor-insight 体检 test/fixtures/node-app」，确认四阶段执行并产出 `REFACTOR-PLAN.md`。
