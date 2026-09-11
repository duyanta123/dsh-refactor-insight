# dsh-refactor-insight 维护规则（Maintenance Runbook）

> 本文档是 dsh-refactor-insight 仓库的专属维护基准，与工作区顶层 docs/PLUGIN-MAINTENANCE.md 通用规则配套使用（该文件位于本仓库之外）。本文件聚焦本仓库的细节。
> 原则：**不改不动，要改就一步到位**——代码/技能、测试、CHANGELOG、版本号、tag 一起改，不留下半成品版本。

## 1. 仓库概况

| 项 | 值 |
|---|---|
| 类型 | 分析型（代码库 → 重构计划） |
| 当前版本 | 0.1.3 |
| 分发状态 | awesome-deepseek-harness 已收录 |
| 运行时 | 零构建 ESM，`plugin/index.js` 由 harness 加载 |
| 核心脚本 | `scripts/refactor-smell.mjs`（六规则诊断）+ `scripts/arch-profile.mjs`（复用自 arch-doc：probe/scan/deps/entry） |

## 2. 目录结构与职责

```text
dsh-refactor-insight/
├── package.json                  # npm 包 + dsh.bundle.patch + files 白名单
├── cordis.patch.yml              # DSH bundle patch
├── plugin/index.js               # ESM 入口，注册 skills/ 为技能根
├── skills/refactor-runbook/SKILL.md  # 四阶段 runbook（受理→扫描→诊断→排序编排）
├── docs/refactor-plan-template.md    # REFACTOR-PLAN.md 输出骨架
├── scripts/arch-profile.mjs      # 复用 arch-doc：probe/scan/deps/entry（零依赖）
├── scripts/refactor-smell.mjs    # 坏味道诊断器（六条规则，--deps-json 复用 deps 输出）
├── test/refactor-smell.test.mjs  # node --test 契约测试（当前 25 例）
├── test/dsh-compat.test.mjs      # DSH 0.1.5-rc.2 宿主兼容性门禁
└── test/fixtures/{python-app,node-app,go-app}/   # 各语言植入已知坏味道
```

## 3. CI 与测试门禁

- **独立脚本回归**：`npm test`（=`node --test test/refactor-smell.test.mjs`），当前 **25 例**。
- **语法门禁**：`node --check scripts/refactor-smell.mjs`、`node --check scripts/arch-profile.mjs`、`node --check plugin/index.js`。
- **DSH 宿主兼容**：`npm run test:compat` 固定 `@deepseek-ai/dsh@0.1.5-rc.2`，要求 Node >=22.19，执行临时 profile 的 add、dump-config 和有限时长启动。
- **GitHub Actions**：ubuntu + windows × Node 18/22 回归 + Node 22.19 compat job。
- 覆盖点：六条规则在三种语言 fixture 上输出**位置与数量精确匹配**（含高耦合 deps 复用 / Tarjan 环检测）。

## 4. 一次完整变更的动作序列

1. 改代码 / 技能 / 文档
2. 补或更新 `test/refactor-smell.test.mjs` 与对应 fixture
3. 更新 `CHANGELOG.md`（先写 `Unreleased`）
4. 本地跑 `npm test` 全绿 + 三处 `node --check`
5. 有行为变更时改 `package.json` 的 `version`（semver）
6. 推送 `main`，GitHub Actions 全绿
7. 打 tag `v0.x.y` 并推送

## 5. 分场景维护细则

### 5.1 诊断规则变更（`refactor-smell.mjs`）
- **高风险区**：六条规则的检测方式与阈值、按语言的函数/类解析（Python 缩进块 / JS-TS 花括号配对 / Go 函数声明）、Tarjan 环检测。
- 阈值改动必须同步三处：脚本默认值、README 双语「CLI 参数」表与「能力」节、runbook 中的说明。
- 每次规则改动必须在对应语言 fixture 上断言位置与数量精确匹配。

### 5.2 arch-profile.mjs 同步
- 本仓的 `scripts/arch-profile.mjs` 复制自 arch-doc（v0「复制改造」决策，见开发计划 §2）。arch-doc 侧扫描器变更时，评估是否同步；`--deps` 输出结构变化是硬约束（`--deps-json` 消费它）。
- 若未来迁移到共享内核 `dsh-repo-scanner`，参照其 `docs/migration-guide.md`。

### 5.3 runbook / 模板调整
- `skills/refactor-runbook/SKILL.md` 四阶段调整，或 `docs/refactor-plan-template.md` 章节变更：确保与脚本实际输出字段（`{ type, path, start_line, evidence, severity, estimated_cost }`）一致，避免 runbook 引用不存在的字段。
- **红线**：runbook 与文档必须保持「只输出计划、不自动改代码」；任何引入自动改码的改动都违反产品定位。

### 5.4 元数据与打包
- 改动对外描述时同步：`README.md` / `README.zh-CN.md` 首段（双语，结构一致）、`package.json` 的 `description`/`keywords`、awesome-deepseek-harness 条目（en/zh 同 PR）。
- 发版时同步双语 README 的 version 徽章与安装示例 tag。
- `files` 白名单已含 `plugin/`、`cordis.patch.yml`、`skills/`、`docs/`、`scripts/`、双语 `README.md`/`README.zh-CN.md`、`CHANGELOG.md`、`PUBLISHING.md`、`LICENSE`——`PLUGIN-MAINTENANCE.md` 与开发计划为仓库维护资产，不在 npm 包内。

## 6. 版本与发布节奏

- 多数改动为 **patch/minor**；输出 JSON 结构变化（消费方为 runbook 与上层报告）视为行为不兼容，升 minor（0.x 阶段以 minor 代 major）。
- 发布动作详见 [PUBLISHING.md](PUBLISHING.md)。

## 7. 发布前清单

- [ ] `npm test` 全绿（25 例）
- [ ] 三处 `node --check` 通过
- [ ] `npm run test:compat` 通过（DSH 0.1.5-rc.2 / Node 22.19+）
- [ ] `CHANGELOG.md` 已归并 `Unreleased`
- [ ] `package.json` `version` 与 tag 一致
- [ ] 双语 README 的 version 徽章与安装示例 tag 已同步
- [ ] 阈值改动已同步脚本默认值 / README 双语 / runbook
- [ ] `files` 字段包含所有应发布文件
- [ ] 对外描述若变，列表条目已同步（或已提交 PR）
- [ ] 推送 `main`，GitHub Actions 全绿
- [ ] 打并推送 tag `v0.x.y`
