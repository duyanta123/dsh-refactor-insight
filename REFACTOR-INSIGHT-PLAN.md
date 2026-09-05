# dsh-refactor-insight 开发计划

> 目标：把代码库的坏味道转成**带定位、优先级和依赖顺序的可执行重构计划**，与 arch-doc（理解现状）、现有 codereview 类（审查 diff）形成错位互补。
> 定位一句话：`Turn codebase smells into an executable, priority-ordered refactoring plan.`

## 1. 产品定位与差异化

| 插件/工具 | 看什么 | 产出 |
|---|---|---|
| arch-doc | 整库结构 | 架构文档（理解现状） |
| **refactor-insight（本插件）** | 整库坏味道 | 重构计划（行动计划） |
| 现有 codereview 类 | PR/diff 变更 | 审查意见（把关变更） |

- 与 arch-doc 的关系：产品层独立（触发场景、列表条目、维护各自独立，避免功能膨胀）；代码/方法论层互补（复用 arch-profile 扫描器 + runbook「事实/推断分离」方法论 + 打包骨架）。
- 明确红线：**只输出计划、不自动改代码**；高风险重构项须人工确认。

## 2. 复用决策

- v0 采用「复制改造」而非跨仓库引库。原因：
  - arch-profile 模块粒度到「目录」，refactor 需到「函数/行」级，扫描逻辑不兼容。
  - 跨仓库依赖路径不稳定。
- 收敛点：等出现第三个分析型插件时，把 `arch-profile.mjs` 提取为独立共享内核库（如 `dsh-repo-scanner`），三个分析型插件共同依赖。

## 3. 目录结构（规划）

```
dsh-refactor-insight/
├── plugin/index.js              # 照抄 arch-doc：FileSystemSkillProvider 注册 skills
├── cordis.patch.yml             # bundle patch 声明
├── scripts/
│   ├── arch-profile.mjs         # 从 arch-doc 复制（probe/scan/deps/entry，原样复用）
│   └── refactor-smell.mjs       # 新增：坏味道诊断器（零依赖，node 内建）
├── skills/refactor-runbook/SKILL.md   # 四阶段 runbook
├── docs/refactor-plan-template.md      # 输出报告骨架
├── test/
│   ├── fixtures/{python-app,node-app,go-app}/   # 各语言植入已知坏味道
│   └── refactor-smell.test.mjs                 # 契约测试（spawnSync 模式照抄 arch-doc）
├── test/dsh-compat.test.mjs                    # DSH 0.1.2-rc.1 宿主门禁
├── .github/workflows/ci.yml     # 独立脚本回归 Node 18/22 + DSH compat Node 22.19
├── package.json / CHANGELOG.md / README.md / LICENSE / PUBLISHING.md
```

## 4. `refactor-smell.mjs`：v0 六条坏味道规则（确定性启发式）

| # | 规则 | 检测方式（零依赖） | 输出定位 |
|---|---|---|---|
| 1 | 超长文件 | 行数 > 400 | 文件级 |
| 2 | 超长函数 | 按语言轻量解析函数起止（Python 缩进块 / JS-TS 花括号配对 / Go 函数声明），函数体 > 80 行 | 文件:行 |
| 3 | 深嵌套 | 缩进 / 花括号最大嵌套深度 > 5 | 文件:行 |
| 4 | 上帝对象 | 类方法数 > 10 或类文件 > 300 行（按语言解析 class） | 文件:行 |
| 5 | 高耦合模块 | 复用 arch-profile 的 `deps` 输出，取内部依赖入度/出度 top 模块 + 环检测 | 模块级 |
| 6 | TODO/FIXME 密度 | 每千行 TODO/FIXME 计数，仅作噪音指标 | 文件:行 |

每项输出 `{ type, path, start_line, evidence, severity(1-5), estimated_cost(S/M/L) }`。
- 脚本只给硬事实（确定性扫描）；LLM 负责精修误报、补上下文、定成本。
- **v0 明确不做**：自动重复代码检测（成本高、易误报，交 LLM 语义判断）、任何自动改码。

## 5. runbook 四阶段（对齐 arch-doc「事实/推断分离」）

- **阶段 0 受理**：repo_path 必填，缺失用 ask_user 一次问清。
- **阶段 1 扫描**：调 `arch-profile.mjs --probe/--scan/--deps/--entry`（复用，无需新代码）。
- **阶段 2 诊断**：调 `refactor-smell.mjs <repo> --all`，输出坏味道 JSON；LLM 逐条核对误报并补充上下文。
- **阶段 3 排序与编排**：按 `severity × cost` 排优先级；用依赖图反推拓扑序（高耦合 / 被依赖多的模块标注「应先重构，否则冲突」）。
- **阶段 4 产出**：严格按 `docs/refactor-plan-template.md` 生成 `REFACTOR-PLAN.md`。

报告模板章节：概览摘要 → 问题清单表（位置/类型/证据/严重度/成本/建议动作/风险）→ 优先级排序 → 依赖顺序编排 → 附录（规则阈值、扫描范围、生成时间）。

## 6. TDD 测试计划

- 每个语言 fixture 植入**已知坏味道**（如 node-app 放一个 90 行函数 + 6 层嵌套；python-app 放一个 15 方法类），断言输出**位置与数量**精确匹配。
- 测试文件复用 arch-doc 的 `spawnSync` CLI 契约模式（`node --test`，零依赖）。
- 预计用例：语言探测复用 3 例 + 六规则各 2~3 例 + deps 排序 1 例，约 15 例。

## 7. 发布与分发

- 打包骨架照 arch-doc：`dsh.bundle.patch` + `files` 字段 + optional peerDependencies。
- `ci.yml` 保留 Node 18/22 独立脚本回归，并增加固定 Node 22.19 的 DSH compat job。
- `npm run test:compat` 固定 `@deepseek-ai/dsh@0.1.2-rc.1`，完成 add、dump-config 与有限时长启动验收。
- 分发：`dsh-plugin` topic + MIT → awesome-dsh-plugin 的 data YAML（**Git & Engineering / Code Review 分类**）+ awesome-deepseek-harness 条目 + Oh-My-DSH 自动同步。
- 对外定位语：`Turn codebase smells into an executable, priority-ordered refactoring plan.`

## 8. 实施顺序（每步测试先行）

1. [x] 脚手架：package.json / cordis.patch.yml / plugin/index.js / ci.yml / CHANGELOG
2. [x] `refactor-smell.mjs` 文件级规则（1、3、6）+ 测试
3. [x] 函数/类级规则（2、4）+ 各语言 fixture + 测试
4. [x] 模块耦合规则（5）+ deps 复用 + 测试
5. [x] runbook SKILL.md + 报告模板
6. [ ] 发布（tag v0.1.0）+ 列表 PR

## 9. 验收标准（Definition of Ready）

- [x] `node --test test/refactor-smell.test.mjs` 全部通过（25 例）
- [x] 六条规则在三种语言 fixture 上输出位置与数量精确匹配（含高耦合 deps 复用/环检测）
- [x] runbook 可用且只读不改码
- [ ] `dsh plugin --profile web add github:duyanta123/dsh-refactor-insight` 可安装并注册技能（发布后验证）
- [ ] CI 全绿；发布 tag v0.1.0
