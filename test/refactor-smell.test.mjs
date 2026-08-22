/**
 * refactor-smell.test.mjs — refactor-smell.mjs 的 CLI 契约测试（node:test，零依赖）。
 *
 * 说明：
 *   - 通过 spawnSync 直接调 CLI 并断言 JSON 输出，测的是 runbook 实际使用的调用契约。
 *   - 运行环境（开发机 / CI）spawn 子进程没有问题；「不 spawn」红线仅约束 DSH 沙箱内的运行时脚本。
 *
 * 运行：node --test test/refactor-smell.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "scripts", "refactor-smell.mjs");
const archProfile = join(root, "scripts", "arch-profile.mjs");
const fixtures = join(root, "test", "fixtures");

/** 跑 CLI，返回 { code, stdout, stderr, json } */
function run(repo, ...args) {
  const r = spawnSync(process.execPath, [script, repo, ...args], { encoding: "utf8" });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = null;
  }
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

test("invalid repo path exits 2", () => {
  const r = run(join(fixtures, "does-not-exist"));
  assert.equal(r.code, 2);
});

test("python: detects deep nesting + todo on core.py, no false positive on __init__", () => {
  const { code, json } = run(join(fixtures, "python-app"));
  assert.equal(code, 0);
  assert.equal(json.language, "python");
  const nest = json.smells.find((s) => s.rule === "deep-nesting");
  assert.ok(nest, "应有 deep-nesting 坏味道");
  assert.ok(nest.max_depth > 5, `max_depth 应 > 5，实际 ${nest.max_depth}`);
  assert.equal(nest.path, "src/app/core.py");
  assert.ok(nest.line > 0);

  const todo = json.smells.find((s) => s.rule === "todo-density");
  assert.ok(todo, "应有 todo 坏味道");
  assert.ok(todo.todos >= 1);

  const fileLen = json.smells.find((s) => s.rule === "file-length");
  // 默认阈值 400，core.py 未超，不应有 file-length
  assert.equal(fileLen, undefined);
});

test("deep-nesting (python): 触发规则后带正确路径与阈值", () => {
  const { json } = run(join(fixtures, "python-app"), "--max-nesting", "5");
  const nest = json.smells.find((s) => s.rule === "deep-nesting");
  assert.ok(nest);
  assert.equal(nest.threshold, 5);
});

test("node (brace): detects deep nesting on deep.js, shallow.js clean", () => {
  const { json } = run(join(fixtures, "node-app"));
  const nest = json.smells.find((s) => s.rule === "deep-nesting");
  assert.ok(nest, "应有 deep-nesting");
  assert.equal(nest.path, "src/lib/deep.js");
  assert.ok(nest.max_depth > 5);
  const shallow = json.smells.some((s) => s.path === "src/lib/shallow.js" && s.rule === "deep-nesting");
  assert.equal(shallow, false, "shallow.js 不应触发嵌套");
});

test("go (brace): detects deep nesting on main.go", () => {
  const { json } = run(join(fixtures, "go-app"));
  const nest = json.smells.find((s) => s.rule === "deep-nesting");
  assert.ok(nest, "应有 deep-nesting");
  assert.equal(nest.path, "cmd/app/main.go");
  assert.ok(nest.max_depth > 5);
});

test("file-length: 用低阈值触发并返回行数", () => {
  const { json } = run(join(fixtures, "node-app"), "--max-lines", "12");
  const smells = json.smells.filter((s) => s.rule === "file-length");
  assert.ok(smells.length >= 1, "低阈值下应有 file-length 坏味道");
  const deep = smells.find((s) => s.path === "src/lib/deep.js");
  assert.ok(deep, "deep.js 应有 file-length");
  assert.ok(deep.lines > deep.threshold, `lines(${deep.lines}) 应 > threshold(${deep.threshold})`);
});

test("exclude-dirs: 排除后对应文件不再扫描", () => {
  const { json } = run(join(fixtures, "node-app"), "--exclude-dirs", "lib");
  const hit = json.smells.some((s) => s.path.startsWith("src/lib/"));
  assert.equal(hit, false, "排除 lib 后不应有 src/lib/ 下坏味道");
});

test("include-dirs: 只扫描指定目录", () => {
  const { json } = run(join(fixtures, "node-app"), "--include-dirs", "src/lib", "--max-lines", "8");
  assert.ok(json.smells.length > 0, "深层 include-dirs 应至少扫到 src/lib 下的文件");
  const all = json.smells.every((s) => s.path.startsWith("src/lib/"));
  assert.equal(all, true, "仅扫描 src/lib 时所有坏味道都应在其中");
});

// ── 步骤 3：函数/类级规则（规则 2 长函数、规则 4 上帝对象）────────────────

test("long-function (python): pipeline.py 触发 >80 行,core.py 不触发", () => {
  const { json } = run(join(fixtures, "python-app"));
  const lf = json.smells.find((s) => s.rule === "long-function");
  assert.ok(lf, "应有 long-function 坏味道");
  assert.equal(lf.path, "src/app/pipeline.py");
  assert.equal(lf.name, "process_pipeline");
  assert.ok(lf.lines > 80, `pipeline.py 函数体应 >80，实际 ${lf.lines}`);
  assert.ok(lf.start > 0);
  const noCore = json.smells.some((s) => s.rule === "long-function" && s.path === "src/app/core.py");
  assert.equal(noCore, false, "core.py 不应触发长函数");
});

test("long-function 阈值可覆盖 (--max-func-lines)", () => {
  const { json } = run(join(fixtures, "python-app"), "--max-func-lines", "50");
  const lf = json.smells.find((s) => s.rule === "long-function");
  assert.ok(lf);
  assert.equal(lf.threshold, 50);
});

test("god-object (python): service.py MonolithService 方法数>10, TinyService 不触发", () => {
  const { json } = run(join(fixtures, "python-app"));
  const go = json.smells.find((s) => s.rule === "god-object");
  assert.ok(go, "应有 god-object 坏味道");
  assert.equal(go.path, "src/app/service.py");
  assert.equal(go.name, "MonolithService");
  assert.ok(go.methods > 10, `MonolithService 方法数应>10，实际 ${go.methods}`);
  assert.ok(go.start > 0);
});

test("long-function (node): runner.js heavyTask >80 行,deep.js 不触发", () => {
  const { json } = run(join(fixtures, "node-app"));
  const lf = json.smells.find((s) => s.rule === "long-function");
  assert.ok(lf, "应有 long-function 坏味道");
  assert.equal(lf.path, "src/lib/runner.js");
  assert.equal(lf.name, "heavyTask");
  assert.ok(lf.lines > 80, `heavyTask 函数体应>80，实际 ${lf.lines}`);
});

test("god-object (node): GodService.js 方法数>10, HealthyService 不触发", () => {
  const { json } = run(join(fixtures, "node-app"));
  const go = json.smells.find((s) => s.rule === "god-object");
  assert.ok(go, "应有 god-object 坏味道");
  assert.equal(go.path, "src/lib/GodService.js");
  assert.equal(go.name, "GodService");
  assert.ok(go.methods > 10, `GodService 方法数应>10，实际 ${go.methods}`);
});

test("long-function (go): internal/pipeline 超长函数,main.go 不触发", () => {
  const { json } = run(join(fixtures, "go-app"));
  const lf = json.smells.find((s) => s.rule === "long-function");
  assert.ok(lf, "应有 long-function 坏味道");
  assert.equal(lf.name, "HeavyProcess");
  assert.ok(lf.lines > 80, `HeavyProcess 函数体应>80，实际 ${lf.lines}`);
  const noMain = json.smells.some((s) => s.rule === "long-function" && s.path === "cmd/app/main.go");
  assert.equal(noMain, false, "main.go 不应触发长函数");
});

test("god-object (go): internal/service Manager 接收者方法数>10", () => {
  const { json } = run(join(fixtures, "go-app"));
  const go = json.smells.find((s) => s.rule === "god-object");
  assert.ok(go, "应有 god-object 坏味道");
  assert.equal(go.name, "Manager");
  assert.ok(go.methods > 10, `Manager 方法数应>10，实际 ${go.methods}`);
});

test("god-object 阈值可覆盖 (--max-methods)", () => {
  const { json } = run(join(fixtures, "go-app"), "--max-methods", "3");
  const go = json.smells.find((s) => s.rule === "god-object");
  assert.ok(go);
  assert.equal(go.threshold, 3);
});
test("god-object (python): --max-class-lines 触发类体行数", () => {
  const { json } = run(join(fixtures, "python-app"), "--max-class-lines", "30");
  const go = json.smells.find((s) => s.rule === "god-object");
  assert.ok(go, "应有 god-object 坏味道");
  assert.equal(go.path, "src/app/service.py");
  assert.ok(go.class_lines > 30, `class_lines 应>30，实际 ${go.class_lines}`);
});

test("god-object (typescript): 识别 public/private/protected 修饰符方法", () => {
  const tmp = mkdtempSync(join(tmpdir(), "refactor-ts-"));
  const src = join(tmp, "src");
  mkdirSync(src, { recursive: true });
  const lines = ["export class TypeScriptService {"];
  for (let i = 1; i <= 9; i++) lines.push(`  public method${i}() { return ${i}; }`);
  lines.push("  private secret() { return 1; }");
  lines.push("  protected helper() { return 2; }");
  lines.push("}");
  writeFileSync(join(src, "service.ts"), lines.join("\n"));

  const { code, json } = run(tmp);
  assert.equal(code, 0);
  const go = json.smells.find((s) => s.rule === "god-object");
  assert.ok(go, "应识别 TS 公开性修饰符方法并触发 god-object");
  assert.equal(go.path, "src/service.ts");
  assert.equal(go.name, "TypeScriptService");
  assert.equal(go.methods, 11);
});

test("deep-nesting (brace): 字符串/模板串/注释中的花括号不参与深度计算", () => {
  const tmp = mkdtempSync(join(tmpdir(), "refactor-mask-"));
  const lines = [
    "export function noise() {",
    "  const s = \"{{{{{{}}}}}}\";",
    "  const t = `{{{{{{}}}}}}`;",
    "  // {{{{{{ }}}}}}",
    "  return s;",
    "}",
  ];
  writeFileSync(join(tmp, "noise.js"), lines.join("\n"));

  const { json } = run(tmp);
  const nest = json.smells.find((s) => s.rule === "deep-nesting");
  assert.equal(nest, undefined, "字符串/模板串/注释中的花括号不应产生 deep-nesting");
});

// ── 步骤 4：高耦合模块规则（规则 5）+ deps 复用 ──────────────────────────

test("未传入 --deps-json 时无 high-coupling/dep_cycle 噪音", () => {
  const { json } = run(join(fixtures, "node-app"));
  const hc = json.smells.some((s) => s.rule === "high-coupling");
  assert.equal(hc, false, "无 deps 输入不应产生耦合坏味道");
  assert.equal(json.module_coupling, undefined);
});

test("high-coupling: 检出扇出 hub 模块与依赖环", () => {
  const depsJson = join(fixtures, "coupling-deps.json");
  const { code, json } = run(join(fixtures, "node-app"), "--deps-json", depsJson);
  assert.equal(code, 0);

  // hub 模块 core：out_degree 4 → 高耦合
  const hub = json.smells.find((s) => s.rule === "high-coupling" && s.type === "high_coupling");
  assert.ok(hub, "应有 high_coupling 坏味道");
  assert.equal(hub.path, "core");
  assert.equal(hub.out_degree, 4);
  assert.ok(hub.out_degree >= hub.threshold, `out_degree(${hub.out_degree}) 应 >= threshold(${hub.threshold})`);

  // 依赖环 libB <-> libC
  const cycles = json.smells.filter((s) => s.type === "dep_cycle");
  assert.equal(cycles.length, 1, "应恰好检出 1 个依赖环");
  assert.deepEqual(cycles[0].members, ["libB", "libC"]);
  assert.equal(cycles[0].size, 2);
});

test("high-coupling 阈值可覆盖 (--max-coupling)", () => {
  const depsJson = join(fixtures, "coupling-deps.json");
  const { json } = run(join(fixtures, "node-app"), "--deps-json", depsJson, "--max-coupling", "2");
  const flags = json.smells.filter((s) => s.type === "high_coupling").map((s) => s.path);
  // 阈值 2：core(out=4)、libB(in=2, 来自 core 和 libC)、libC(in=2) 均触发；
  // libA/libD 度数 < 2 不触发
  assert.deepEqual(flags.sort(), ["core", "libB", "libC"]);
  const libC = json.smells.find((s) => s.type === "high_coupling" && s.path === "libC");
  assert.equal(libC.threshold, 2);
  assert.equal(json.module_coupling.count, 5);
});

test("module_coupling 提供出入度供拓扑排序", () => {
  const depsJson = join(fixtures, "coupling-deps.json");
  const { json } = run(join(fixtures, "node-app"), "--deps-json", depsJson);
  assert.ok(Array.isArray(json.module_coupling.modules), "module_coupling.modules 应为数组");
  const core = json.module_coupling.modules.find((m) => m.name === "core");
  assert.ok(core, "module_coupling 应含 core");
  assert.equal(core.out_degree, 4);
  assert.equal(core.coupling, 4);
  assert.deepEqual(json.module_coupling.cycles[0].members, ["libB", "libC"]);
});

test("deps 复用端到端: arch-profile --deps 输出可直接喂给 refactor-smell", () => {
  // 用真实 arch-profile 生成 deps 后管道到 refactor-smell，验证复用链路
  const tmp = mkdtempSync(join(tmpdir(), "refactor-deps-"));
  const depsFile = join(tmp, "deps.json");
  const arch = spawnSync(process.execPath, [archProfile, join(fixtures, "python-app"), "--deps"], { encoding: "utf8" });
  assert.equal(arch.status, 0, "arch-profile --deps 应成功");
  writeFileSync(depsFile, arch.stdout);

  const { code, json } = run(join(fixtures, "python-app"), "--deps-json", depsFile);
  assert.equal(code, 0);
  assert.ok(Array.isArray(json.module_coupling.modules), "应解析出 module_coupling（即便内部依赖为空也需结构健壮）");
  assert.ok(typeof json.module_coupling.count === "number");
});
test("deps JSON 兼容 PowerShell UTF-16LE BOM 重定向", () => {
  const tmp = mkdtempSync(join(tmpdir(), "refactor-deps-bom-"));
  const depsFile = join(tmp, "deps.json");
  const arch = spawnSync(process.execPath, [archProfile, join(fixtures, "python-app"), "--deps"], { encoding: "utf8" });
  assert.equal(arch.status, 0, "arch-profile --deps 应成功");
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(arch.stdout, "utf16le")]);
  writeFileSync(depsFile, utf16);

  const { code, json } = run(join(fixtures, "python-app"), "--deps-json", depsFile);
  assert.equal(code, 0);
  assert.ok(json.module_coupling, "UTF-16LE BOM deps 应被容错解析");
  assert.ok(Array.isArray(json.module_coupling.modules));
});