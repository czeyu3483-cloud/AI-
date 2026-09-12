import vm from "node:vm";
import type { CodingProblem, CodingRunResult, CodingTestCase } from "./types";

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a == null || b == null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a as object).sort();
    const bk = Object.keys(b as object).sort();
    if (ak.length !== bk.length) return false;
    return ak.every((k, i) => k === bk[i] && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

function extractFnName(starterOrCode: string, problem: CodingProblem): string {
  const fromStarter = problem.starterCode.match(/function\s+([A-Za-z_][\w]*)/);
  if (fromStarter?.[1]) return fromStarter[1];
  const fromCode = starterOrCode.match(/function\s+([A-Za-z_][\w]*)/);
  if (fromCode?.[1]) return fromCode[1];
  if (problem.id.includes("paren")) return "isValid";
  return "twoSum";
}

function runOneTest(
  fn: (...args: unknown[]) => unknown,
  test: CodingTestCase,
): { passed: boolean; actual?: unknown; error?: string } {
  try {
    const actual = fn(...test.args);
    return { passed: deepEqual(actual, test.expected), actual };
  } catch (e) {
    return {
      passed: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * 在受限 vm 中执行候选人提交的 JS，跑内置用例。
 * 禁止 require/process/fs；超时硬截断。
 */
export function runCodingSubmission(input: {
  problem: CodingProblem;
  code: string;
  notes?: string;
}): CodingRunResult {
  const code = (input.code || "").trim();
  const started = Date.now();
  const base: CodingRunResult = {
    problemId: input.problem.id,
    title: input.problem.title,
    code,
    passed: false,
    total: input.problem.tests.length,
    passedCount: 0,
    failedTests: [],
    complexityNotes: input.notes?.trim() || input.problem.complexityHint,
    ranAt: new Date().toISOString(),
  };

  if (!code || code.length < 8) {
    return {
      ...base,
      error: "代码为空或过短",
      durationMs: Date.now() - started,
    };
  }
  if (/require\s*\(|process\.|globalThis|Function\s*\(|eval\s*\(|import\s+|fs\.|child_process/i.test(code)) {
    return {
      ...base,
      error: "代码包含不允许的 API（require/process/eval 等）",
      durationMs: Date.now() - started,
    };
  }

  const fnName = extractFnName(code, input.problem);
  let sandboxFn: ((...args: unknown[]) => unknown) | null = null;
  try {
    const sandbox: Record<string, unknown> = { console: { log() {}, warn() {}, error() {} } };
    const wrapped = `${code}\n;typeof ${fnName} === "function" ? ${fnName} : null;`;
    const script = new vm.Script(wrapped, { filename: "candidate.js" });
    const ctx = vm.createContext(sandbox);
    const result = script.runInContext(ctx, { timeout: 800, displayErrors: true });
    if (typeof result !== "function") {
      return {
        ...base,
        error: `未找到可调用函数 ${fnName}，请用 function ${fnName}(...) { ... } 定义`,
        durationMs: Date.now() - started,
      };
    }
    sandboxFn = result as (...args: unknown[]) => unknown;
  } catch (e) {
    return {
      ...base,
      error: e instanceof Error ? e.message : "代码执行失败",
      durationMs: Date.now() - started,
    };
  }

  let passedCount = 0;
  const failedTests: CodingRunResult["failedTests"] = [];
  for (const t of input.problem.tests) {
    const r = runOneTest(sandboxFn!, t);
    if (r.passed) passedCount += 1;
    else {
      failedTests.push({
        name: t.name,
        expected: t.expected,
        actual: r.error ? `Error: ${r.error}` : r.actual,
      });
    }
  }

  return {
    ...base,
    passed: passedCount === input.problem.tests.length,
    passedCount,
    failedTests,
    durationMs: Date.now() - started,
  };
}
