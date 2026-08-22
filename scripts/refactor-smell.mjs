#!/usr/bin/env node
/**
 * refactor-smell.mjs — 零依赖代码库坏味道诊断器（纯 Node 内建，不 spawn 子进程）。
 *
 * 用途：对一个本地代码库做确定性扫描，产出「硬事实」坏味道清单 JSON。
 *   v0 实现六条规则（可覆盖阈值）：
 *     长文件   file-length    行数 > max-lines (400)
 *     长函数   long-function  函数体 > max-func-lines (80)   [函数/类级]
 *     深嵌套   deep-nesting   最大嵌套深度 > max-nesting (5)
 *     上帝对象 god-object     类/接收者类型 方法数 > max-methods (10)
 *                            或类体行数 > max-class-lines (300)   [函数/类级]
 *     高耦合模块 high-coupling 复用 arch-profile deps（步骤 4）
 *     TODO/FIXME/HACK 密度 todo-density（噪音指标，每千行计数）
 *   LLM 只在此基础上做误报精修、补上下文、定严重度与成本。
 *
 * 用法：
 *   node refactor-smell.mjs <repo_path> [--all]
 *     [--max-depth N] [--max-lines N] [--max-nesting N]
 *     [--max-func-lines N] [--max-methods N] [--max-class-lines N]
 *     [--deps-json path] [--max-coupling N]
 *     [--include-dirs a,b] [--exclude-dirs a,b]
 *
 * 公共参数：
 *   --max-depth <N>       目录扫描深度，默认 4（1–10）
 *   --max-lines <N>       超长文件阈值，默认 400
 *   --max-nesting <N>     深嵌套阈值，默认 5
 *   --max-func-lines <N>  长函数阈值（函数体行数），默认 80
 *   --max-methods <N>     上帝对象阈值（类方法数 / Go 接收者方法数），默认 10
 *   --max-class-lines <N> 上帝对象阈值（类体行数），默认 300
 *   --deps-json <path>    arch-profile.mjs --deps 输出文件（供高耦合/环检测，复用 deps）
 *   --max-coupling <N>    高耦合阈值（in_degree 或 out_degree），默认 4
 *   --include-dirs <a,b>  只分析这些目录（相对 repo_path）
 *   --exclude-dirs <a,b>  额外排除目录
 *
 * 红线：本脚本只读、只输出诊断，绝不修改任何目标文件。高耦合使用 arch-profile 的
 *       deps 输出（经 --deps-json 传入），不在运行时 spawn 子进程。
 */

import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";

// ── 常量 ────────────────────────────────────────────────────────────────
const DEFAULT_EXCLUDE_DIRS = [
  ".git", "node_modules", "dist", "build", "__pycache__",
  ".venv", "venv", "target", ".idea", ".vscode", ".pytest_cache",
  ".mypy_cache", "coverage", ".next", ".nuxt",
];

// 做嵌套 / 行数 / TODO 分析的目标代码文件
const CODE_EXTS = new Set([
  ".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".go", ".java", ".kt",
  ".kts", ".rs", ".c", ".h", ".cpp", ".hpp", ".cc", ".rb", ".php", ".vue",
  ".svelte",
]);

// 函数/类级规则只对「块语言」与缩进语言生效（含 Go 接收者方法分组）
const BRACE_LANGS = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".go", ".java", ".kt", ".kts",
  ".rs", ".c", ".h", ".cpp", ".hpp", ".cc", ".rb", ".php", ".vue", ".svelte",
]);

const MAX_FILE_BYTES = 256 * 1000;

// ── 参数解析 ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const repoArg = args.find((a) => !a.startsWith("--"));
const getArg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

const maxDepth = clamp(Number(getArg("--max-depth", "4")) || 4, 1, 10);
const maxLines = clamp(Number(getArg("--max-lines", "400")) || 400, 10, 10000);
const maxNesting = clamp(Number(getArg("--max-nesting", "5")) || 5, 1, 50);
const maxFuncLines = clamp(Number(getArg("--max-func-lines", "80")) || 80, 10, 10000);
const maxMethods = clamp(Number(getArg("--max-methods", "10")) || 10, 1, 1000);
const maxClassLines = clamp(Number(getArg("--max-class-lines", "300")) || 300, 10, 10000);
const depsJsonPath = getArg("--deps-json", "");
const maxCoupling = clamp(Number(getArg("--max-coupling", "4")) || 4, 1, 1000);
const includeDirs = (getArg("--include-dirs", "") || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const extraExclude = (getArg("--exclude-dirs", "") || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const excludeDirs = new Set([...DEFAULT_EXCLUDE_DIRS, ...extraExclude]);

if (!repoArg) {
  console.error("用法: node refactor-smell.mjs <repo_path> [--max-depth N] [--max-lines N] [--max-nesting N] [--max-func-lines N] [--max-methods N] [--max-class-lines N] [--deps-json path] [--max-coupling N] [--include-dirs a,b] [--exclude-dirs a,b]");
  process.exit(2);
}

let root;
try {
  root = resolve(repoArg);
} catch {
  console.error("错误: repo_path 无效");
  process.exit(2);
}

// ── 工具函数 ────────────────────────────────────────────────────────────
function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}
function isFile(p) {
  try { return statSync(p).isFile(); } catch { return false; }
}
function isExcluded(name) {
  return excludeDirs.has(name) || name.startsWith(".git");
}
function readText(p) {
  try {
    if (!isFile(p)) return "";
    if (statSync(p).size > MAX_FILE_BYTES) return "";
    return readFileSync(p).toString("utf8");
  } catch {
    return "";
  }
}

/**
 * 读 JSON 文件并容错 BOM（PowerShell `>` 重定向会生成 UTF-16LE BOM）。
 * 优先作为 Buffer 读取，避免远端依赖文件编码导致 JSON.parse 失败。
 */
function readJsonFile(p) {
  const buf = readFileSync(p);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.subarray(2).toString("utf16le");
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return Buffer.from(buf.subarray(2)).swap16().toString("utf16le");
  }
  return buf.toString("utf8").replace(/^\uFEFF/, "");
}
function normalizePath(p) {
  return p.split(sep).join("/");
}
function relp(f) {
  return normalizePath(relative(root, f));
}
function basenamePosix(rel) {
  const i = rel.lastIndexOf("/");
  return i < 0 ? rel : rel.slice(i + 1);
}
function codeExt(rel) {
  const b = basenamePosix(rel).toLowerCase();
  const dot = b.lastIndexOf(".");
  return dot < 0 ? "" : b.slice(dot);
}
const isCodeFile = (rel) => CODE_EXTS.has(codeExt(rel));

// ── 遍历 ────────────────────────────────────────────────────────────────
function normalizeIncludedDir(p) {
  return normalizePath(p).replace(/^\.\//, "").replace(/\/+$/, "");
}

function walk() {
  const files = [];
  const inc = includeDirs.length ? includeDirs.map(normalizeIncludedDir) : null;
  const isDirIncluded = (relDir) =>
    !inc || inc.some((incDir) =>
      incDir === relDir ||
      incDir.startsWith(relDir + "/") ||
      relDir.startsWith(incDir + "/")
    );
  const isFileIncluded = (relFile) =>
    !inc || inc.some((incDir) =>
      relFile === incDir ||
      relFile.startsWith(incDir + "/")
    );

  function recur(dir, depth, relDir) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const childRel = relDir ? `${relDir}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (isExcluded(e.name)) continue;
        if (!isDirIncluded(childRel)) continue;
        recur(join(dir, e.name), depth + 1, childRel);
      } else if (e.isFile()) {
        if (!isFileIncluded(childRel)) continue;
        files.push(join(dir, e.name));
      }
    }
  }
  recur(root, 0, "");
  return files;
}

// ── 深度测量 ────────────────────────────────────────────────────────────
function isCommentLine(line, indentLang) {
  const t = line.trim();
  if (!t) return true;
  if (indentLang) {
    if (t.startsWith("#")) return true;
    return false;
  }
  return t.startsWith("//") || t.startsWith("/*") || t.startsWith("*");
}
function createMaskState() {
  return { blockComment: false, template: false };
}

/**
 * 把花括号语言中字符串/注释/模板串所在的字符掩码为空格，只保留真实代码花括号。
 * 逐行调用；跨行块注释与跨行模板串状态保存在 state 中。
 * 说明：不尝试识别 JS 正则字面量，仍可能把 /{}/ 这类正则算作花括号，由后续 LLM 精修。
 */
function maskCodeLine(line, state, isGo) {
  let out = "";
  let i = 0;
  const n = line.length;
  while (i < n) {
    if (state.blockComment) {
      if (line[i] === "*" && line[i + 1] === "/") {
        state.blockComment = false;
        out += "  ";
        i += 2;
        continue;
      }
      out += " ";
      i++;
      continue;
    }
    if (state.template) {
      if (line[i] === "\\" && !isGo && i + 1 < n) {
        out += "  ";
        i += 2;
        continue;
      }
      if (line[i] === "`") {
        state.template = false;
        out += " ";
        i++;
        continue;
      }
      out += " ";
      i++;
      continue;
    }
    const c = line[i];
    if (c === "/" && line[i + 1] === "/") {
      out += " ".repeat(n - i);
      i = n;
      break;
    }
    if (c === "/" && line[i + 1] === "*") {
      state.blockComment = true;
      out += "  ";
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      out += " ";
      i++;
      while (i < n) {
        if (line[i] === "\\" && i + 1 < n) {
          out += "  ";
          i += 2;
          continue;
        }
        if (line[i] === quote) {
          out += " ";
          i++;
          break;
        }
        out += " ";
        i++;
      }
      continue;
    }
    if (c === "`") {
      state.template = true;
      out += " ";
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * 返回 { max, line }。
 * - Python（缩进语言）：按前导空格 / 4 计深度。
 * - 其他（花括号语言）：逐字符累加 {} 深度。
 */
function measureNesting(lines, ext) {
  const indentLang = ext === ".py";
  const maskState = createMaskState();
  let depth = 0;
  let max = 0;
  let maxLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentLine(line, indentLang)) continue;
    if (indentLang) {
      const leading = line.match(/^ */)[0].length;
      const d = Math.round(leading / 4);
      if (d > max) {
        max = d;
        maxLine = i + 1;
      }
    } else {
      if (!line.trim()) continue;
      const masked = maskCodeLine(line, maskState, ext === ".go");
      for (const ch of masked) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
      if (depth < 0) depth = 0;
      if (depth > max) {
        max = depth;
        maxLine = i + 1;
      }
    }
  }
  return { max, line: maxLine };
}

// ── 函数/类级块解析器 ──────────────────────────────────────────────────
function findIndent(raw) {
  const m = raw.match(/^ */);
  return m[0].length;
}

/** Python（缩进语言）：提取函数与类簇，类内统计方法行。 */
function pyBlocks(lines) {
  const funcs = [];
  const classes = []; // { name, start, methods: [line...] }
  const stack = []; // { kind: "class"|"def", indent, parentClass }
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (!t) continue;
    const indent = findIndent(raw);
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    let m;
    if ((m = t.match(/^class\s+(\w+)/))) {
      const cls = { name: m[1], start: i + 1, methods: [] };
      classes.push(cls);
      stack.push({ kind: "class", indent, parentClass: cls });
    } else if ((m = t.match(/^(?:async\s+)?def\s+(\w+)/))) {
      const enclosing = stack[stack.length - 1];
      if (enclosing && enclosing.kind === "class") {
        enclosing.parentClass.methods.push(i + 1);
      }
      // 函数体行数：从 def 后到缩进回落到 def 缩进为止
      let body = 0;
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j];
        if (!l.trim()) continue;
        if (findIndent(l) <= indent) break;
        body++;
      }
      funcs.push({ name: m[1], start: i + 1, body });
      stack.push({ kind: "def", indent, parentClass: enclosing && enclosing.kind === "class" ? enclosing.parentClass : null });
    }
  }
  // 计算类结束行（供 god-object 的 class_lines 触发），以类体最后非空行为准。
  for (const cls of classes) {
    const baseIndent = findIndent(lines[cls.start - 1]);
    let prevNonBlank = cls.start - 1;
    let end = lines.length;
    for (let j = cls.start; j < lines.length; j++) {
      const l = lines[j];
      if (!l.trim()) continue;
      if (findIndent(l) <= baseIndent) break;
      prevNonBlank = j;
    }
    end = prevNonBlank + 1;
    cls.end = end;
  }
  return { funcs, classes, goGroups: null };
}

/** 探测一行是否为「声明头」（函数/类/方法）。返回 {kind,name} 或 null。 */
function detectDecl(t, isGo) {
  let m;
  if ((m = t.match(/^(?:export\s+)?(?:default\s+)?(?:\/\*[\s\S]*?\*\/\s*)?(?:(?:abstract|declare)\s+)?class\s+([A-Za-z_$][\w$]*)/))) {
    return { kind: "class", name: m[1] };
  }
  if (isGo) {
    if (/^func\b/.test(t)) {
      const recv = t.match(/^func\s*\([^)]*\)\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
      if (recv) return { kind: "method", name: recv[1] };
      const fn = t.match(/^func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
      return { kind: "function", name: fn ? fn[1] : "" };
    }
    return null;
  }
  if (
    /\b(?:async\s+)?function\s+(?:[A-Za-z_$][\w$]*)\s*\(/.test(t) ||
    /\b(?:async\s+)?function\s*\(/.test(t)
  ) {
    const fn = t.match(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
    return { kind: "function", name: fn ? fn[1] : "" };
  }
  // 箭头函数（块体）
  if (/=>\s*\{/.test(t)) {
    const an = t.match(/([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{/);
    return { kind: "function", name: an ? an[1] : "" };
  }
  // 类方法 / get/set/static/async/公开性/TS 修饰符方法：标识符后紧跟 (
  const methodRe = /^(?:(?:static|async|get|set|readonly|public|private|protected|abstract|override|declare)\s+)*(?:[#A-Za-z_$][\w$]*)\s*\(/;
  if (methodRe.test(t)) {
    const mn = t.match(/([\w$]+)\s*\(/);
    return { kind: "method", name: mn ? mn[1] : "" };
  }
  return null;
}

/** 花括号语言（含 Go）：按花括号配对提取函数与方法，方法归属最近外层类。 */
function braceBlocks(lines, ext) {
  const isGo = ext === ".go";
  const funcs = [];
  const classes = []; // { name, start, end, methods: [...] }
  const stack = []; // { kind, name, start, methods }
  const maskState = createMaskState();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) continue;
    const decl = detectDecl(t, isGo);
    const masked = maskCodeLine(line, maskState, isGo);
    let usedDecl = false;
    for (const ch of masked) {
      if (ch === "{") {
        let kind = "block";
        let name = "";
        if (!usedDecl && decl) {
          usedDecl = true;
          name = decl.name;
          const parent = stack[stack.length - 1];
          if (decl.kind === "class") kind = "class";
          else if (decl.kind === "function") kind = "function";
          else if (decl.kind === "method" && (isGo || (parent && parent.kind === "class"))) kind = "method";
          else kind = "block";
        }
        stack.push({ kind, name, start: i + 1, methods: kind === "class" ? [] : null });
      } else if (ch === "}") {
        const top = stack.pop();
        if (!top) continue;
        const end = i + 1;
        if (top.kind === "function") {
          funcs.push({ name: top.name, start: top.start, body: Math.max(0, end - top.start) });
        } else if (top.kind === "method") {
          funcs.push({ name: top.name, start: top.start, body: Math.max(0, end - top.start) });
          const cls = [...stack].reverse().find((f) => f.kind === "class");
          if (cls) cls.methods.push(top.start);
        } else if (top.kind === "class") {
          classes.push({ name: top.name, start: top.start, end, methods: top.methods });
        }
      }
    }
  }
  // Go 接收者方法按接收者类型分组（上帝对象在无 class 时按类型归并）
  const goGroups = {};
  if (isGo) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s*func\s*\(\s*\w+\s+\*?([A-Za-z_]\w*)\s*\)\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
      if (m) {
        (goGroups[m[1]] = goGroups[m[1]] || []).push({ name: m[2], line: i + 1 });
      }
    }
  }
  return { funcs, classes, goGroups: Object.keys(goGroups).length ? goGroups : null };
}

function extractBlocks(lines, ext) {
  if (ext === ".py") return pyBlocks(lines);
  if (BRACE_LANGS.has(ext)) return braceBlocks(lines, ext);
  return { funcs: [], classes: [], goGroups: null };
}

// ── 坏味道规则 ─────────────────────────────────────────────────────────
function ruleFileLength(rel, text) {
  const lines = text.split(/\r?\n/);
  const total = text.endsWith("\n") ? lines.length - 1 : lines.length;
  if (total > maxLines) {
    return {
      rule: "file-length",
      type: "long_file",
      path: rel,
      lines: total,
      threshold: maxLines,
      severity: Math.min(5, 2 + (total / maxLines - 1) * 3 | 0),
      cost: total > maxLines * 3 ? "L" : "M",
    };
  }
  return null;
}

function ruleDeepNesting(rel, text) {
  const ext = codeExt(rel);
  const lines = text.split(/\r?\n/);
  const { max, line } = measureNesting(lines, ext);
  if (max > maxNesting) {
    const excess = max - maxNesting;
    return {
      rule: "deep-nesting",
      type: "deep_nesting",
      path: rel,
      max_depth: max,
      threshold: maxNesting,
      line,
      severity: Math.min(5, 2 + excess),
      cost: max > maxNesting + 3 ? "M" : "S",
    };
  }
  return null;
}

/** 规则 2：长函数 —— 函数体 > max-func-lines 行。 */
function ruleLongFunction(rel, blocks) {
  const out = [];
  for (const f of blocks.funcs) {
    if (f.body > maxFuncLines) {
      out.push({
        rule: "long-function",
        type: "long_function",
        path: rel,
        name: f.name,
        start: f.start,
        lines: f.body,
        threshold: maxFuncLines,
        severity: Math.min(5, 2 + ((f.body - maxFuncLines) / 20 | 0)),
        cost: f.body > maxFuncLines * 2 ? "L" : "M",
      });
    }
  }
  return out;
}

/** 规则 4：上帝对象 —— 类/接收者类型方法数 > max-methods 或类体行数 > max-class-lines。 */
function ruleGodObject(rel, blocks) {
  const out = [];
  const push = (name, startLine, methodCount, classEnd) => {
    const classLines = classEnd ? classEnd - startLine + 1 : 0;
    const methodHits = methodCount > maxMethods;
      const classHits = classEnd !== null && classLines > maxClassLines;
      if (!methodHits && !classHits) return;
      const methodExcess = methodHits ? Math.floor((methodCount - maxMethods) / 3) : 0;
      const classExcess = classHits ? Math.floor((classLines - maxClassLines) / 100) : 0;
    out.push({
      rule: "god-object",
      type: "god_object",
      path: rel,
      name,
      start: startLine,
      methods: methodCount,
      class_lines: classLines || undefined,
      threshold: methodHits ? maxMethods : maxClassLines,
      severity: Math.min(5, 2 + Math.max(methodExcess, classExcess)),
      cost: methodCount > maxMethods * 2 || (classHits && classLines > maxClassLines * 2) ? "L" : "M",
    });
  };
  for (const c of blocks.classes) {
    push(c.name, c.start, c.methods.length, c.end);
  }
  if (blocks.goGroups) {
    for (const [typeName, methods] of Object.entries(blocks.goGroups)) {
      push(typeName, methods[0].line, methods.length, null);
    }
  }
  return out;
}

const TODO_PAT = /(TODO|FIXME|HACK)\b/i;

function ruleTodoDensity(rel, text) {
  const ext = codeExt(rel);
  const lines = text.split(/\r?\n/);
  const total = text.endsWith("\n") ? lines.length - 1 : lines.length;
  let todos = 0;
  for (const line of lines) {
    if (TODO_PAT.test(line)) todos++;
  }
  if (todos > 0) {
    const per1k = total > 0 ? Number(((todos / total) * 1000).toFixed(1)) : 0;
    return {
      rule: "todo-density",
      type: "todo",
      path: rel,
      todos,
      lines: total,
      per_1k: per1k,
      severity: per1k >= 5 ? 3 : 1,
      cost: "S",
    };
  }
  return null;
}

// ── 规则 5：高耦合模块 + 环检测（复用 arch-profile --deps 输出）──────────
// Tarjan 强连通分量：返回强连通分量数组（size > 1 即环，size = 1 需自环才算环）。
function tarjanSCC(adj, nodes) {
  let index = 0;
  const indices = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const comps = [];
  function strongconnect(v) {
    indices.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    const deps = adj.get(v) || new Set();
    for (const w of deps) {
      if (w === v) continue;
      if (!indices.has(w)) {
        strongconnect(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), indices.get(w)));
      }
    }
    if (low.get(v) === indices.get(v)) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      comps.push(comp);
    }
  }
  for (const n of nodes) if (!indices.has(n)) strongconnect(n);
  return comps;
}

/**
 * 读入 arch-profile `--deps` 输出，计算每模块出入度 + 环，产出高耦合 / 环坏味道。
 * 返回 { smells, modules, cycles }。
 * deps JSON 结构兼容：{ dependencies: { internal: [{source,target,...}] } } 或
 * 直接的 { internal: [...] }。
 */
function ruleHighCoupling(depsPath) {
  if (!depsPath) return { smells: [], modules: [], cycles: [] };
  let data;
  try {
    data = JSON.parse(readJsonFile(depsPath));
  } catch {
    console.error("警告: --deps-json 无法读取或解析，跳过高耦合检测: " + depsPath);
    return { smells: [], modules: [], cycles: [] };
  }
  const raw = data.dependencies || data;
  const internal = Array.isArray(raw.internal) ? raw.internal : (Array.isArray(raw) ? raw : []);
  if (!Array.isArray(internal)) return { smells: [], modules: [], cycles: [] };

  const inDeg = new Map();
  const outDeg = new Map();
  const deps = new Map(); // 邻接表（去重）
  const nodes = new Set();
  for (const edge of internal) {
    const s = edge.source;
    const t = edge.target;
    if (!s || !t || s === t) continue;
    nodes.add(s);
    nodes.add(t);
    outDeg.set(s, (outDeg.get(s) || 0) + 1);
    inDeg.set(t, (inDeg.get(t) || 0) + 1);
    if (!deps.has(s)) deps.set(s, new Set());
    deps.get(s).add(t);
  }
  if (nodes.size === 0) return { smells: [], modules: [], cycles: [] };

  const modules = [...nodes].map((name) => {
    const inDegree = inDeg.get(name) || 0;
    const outDegree = outDeg.get(name) || 0;
    return {
      name,
      in_degree: inDegree,
      out_degree: outDegree,
      coupling: inDegree + outDegree,
    };
  });
  modules.sort((a, b) => b.coupling - a.coupling || b.out_degree - a.out_degree);

  const smells = [];
  for (const m of modules) {
    if (m.in_degree >= maxCoupling || m.out_degree >= maxCoupling) {
      smells.push({
        rule: "high-coupling",
        type: "high_coupling",
        path: m.name,
        in_degree: m.in_degree,
        out_degree: m.out_degree,
        coupling: m.coupling,
        threshold: maxCoupling,
        severity: Math.min(5, 2 + ((m.coupling - maxCoupling) / 2 | 0)),
        cost: m.out_degree >= maxCoupling * 2 ? "L" : "M",
      });
    }
  }

  const comps = tarjanSCC(deps, [...nodes]);
  const cycles = [];
  for (const comp of comps) {
    const realCycle = comp.length > 1 || (comp.length === 1 && (deps.get(comp[0]) || new Set()).has(comp[0]));
    if (!realCycle) continue;
    const sorted = [...comp].sort();
    cycles.push({ size: comp.length, members: sorted });
    smells.push({
      rule: "high-coupling",
      type: "dep_cycle",
      path: [...sorted, sorted[0]].join(" -> "),
      size: comp.length,
      members: sorted,
      severity: Math.min(5, 2 + (comp.length - 1)),
      cost: comp.length > 2 ? "L" : "M",
    });
  }

  return { smells, modules, cycles };
}

// ── 主流程 ──────────────────────────────────────────────────────────────
if (!isDir(root)) {
  console.error("错误: repo_path 不存在或不是目录: " + repoArg);
  process.exit(2);
}

const files = walk();
const smells = [];

for (const f of files) {
  const rel = relp(f);
  if (!isCodeFile(rel)) continue;
  const text = readText(f);
  if (!text) continue;

  const r1 = ruleFileLength(rel, text);
  if (r1) smells.push(r1);

  const r3 = ruleDeepNesting(rel, text);
  if (r3) smells.push(r3);

  const r6 = ruleTodoDensity(rel, text);
  if (r6) smells.push(r6);

  const lines = text.split(/\r?\n/);
  const blocks = extractBlocks(lines, codeExt(rel));
  for (const r2 of ruleLongFunction(rel, blocks)) smells.push(r2);
  for (const r4 of ruleGodObject(rel, blocks)) smells.push(r4);
}

// 高耦合 / 环检测（复用 arch-profile --deps 输出）
const coupling = ruleHighCoupling(depsJsonPath);
for (const s of coupling.smells) smells.push(s);

// 供 runbook 参考的项目语言（仅按入口文件提示，规则本身按文件扩展名判定）
function detectLanguageHint() {
  const has = (n) => existsSync(join(root, n));
  if (has("pyproject.toml") || has("requirements.txt")) return "python";
  if (has("go.mod")) return "go";
  if (has("package.json")) return "javascript/typescript";
  if (has("pom.xml") || has("build.gradle")) return "java";
  return "generic";
}

const report = {
  language: detectLanguageHint(),
  scanned_count: files.filter((f) => isCodeFile(relp(f))).length,
  thresholds: {
    max_lines: maxLines,
    max_nesting: maxNesting,
    max_func_lines: maxFuncLines,
    max_methods: maxMethods,
    max_class_lines: maxClassLines,
  },
  smells,
};

// 提供 deps 时附带模块耦合/环数据（供 runbook 阶段 3 拓扑排序）
if (depsJsonPath) {
  report.module_coupling = {
    count: coupling.modules.length,
    modules: coupling.modules,
    cycles: coupling.cycles,
  };
}

process.stdout.write(JSON.stringify(report, null, 2) + "\n");