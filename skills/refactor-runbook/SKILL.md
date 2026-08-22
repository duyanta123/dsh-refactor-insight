---
name: refactor-insight
description: 重构入口诊断：输入一个代码库路径，自动检测坏味道（超长文件 / 长函数 / 深嵌套 / 上帝对象 / 高耦合模块 / TODO 密度），输出带定位、优先级与依赖顺序的结构化重构计划。需要体检代码质量、排重构优先级、找技术债、制定重构顺序时加载本技能。
---

# refactor-insight Runbook

把代码库的坏味道转成「带定位、优先级和依赖顺序的可执行重构计划」。

## 执行原则
1. 区分事实与推断：坏味道定位/计数来自脚本事实，严重度/成本/建议动作由 LLM 标注并注明推断。
2. 只读不改：本技能**绝不自动修改任何源码**；重构动作须由用户确认后另走 workflow 执行。
3. 不编造：脚本未检测到的项不硬造；检测到但实际合理的（如故意写的深层结构）标注「误报待人工确认」。
4. 大仓库保护：源文件较多或目录深度较大时，先按 `--max-depth` 收敛扫描范围，禁止逐文件通读。

## 阶段 0：输入受理
- 识别用户输入：repo_path（必填）；max_lines（默认 400）；max_nesting（默认 5）；max_depth（默认 4）；include_dirs；exclude_dirs。
- 缺少 repo_path 时用 ask_user 一次问清。
- 门槛：repo_path 存在且为目录。

## 阶段 1：结构扫描（复用）
- 调用 `node scripts/arch-profile.mjs <repo> --probe` 获取语言 / 仓库类型 / 技术栈。
- 调用 `node scripts/arch-profile.mjs <repo> --deps` 获取内部依赖，**写盘为 dep 文件**供阶段 2 复用（高耦合 / 环检测）。bash 用 `node scripts/arch-profile.mjs <repo> --deps > deps.json`；PowerShell 用 `node scripts/arch-profile.mjs <repo> --deps | Out-File -Encoding utf8 deps.json`。

## 阶段 2：坏味道诊断
- 调用 `node scripts/refactor-smell.mjs <repo> --deps-json <deps.json> [--max-lines N] [--max-nesting N] [--max-depth N] [--max-coupling N]`。
- 脚本输出 `smells[]`（含 high-coupling / dep_cycle）与 `module_coupling`（出入度 + 环）。
- LLM 逐条核对：剔除误报，补充上下文（为什么这里深嵌套、被多少人修改过等）。

## 阶段 3：排序与编排
- 按 `severity × cost` 排优先级（severity 高且 cost 低的优先）。
- 基于 `module_coupling.modules` 的入度/出度与 `module_coupling.cycles` 反推**拓扑序**：高耦合 / 被依赖多的模块（高入度）、环内模块标注「应先重构，否则后续改动冲突」。

## 阶段 4：计划产出
- 严格按 docs/refactor-plan-template.md 骨架生成 REFACTOR-PLAN.md。
- 门槛：每项都有 path/规则/严重度/成本/建议动作；关键项有风险标注与依赖顺序。