import type { Reporter } from 'vitest/node';

type TestModuleArg = Parameters<NonNullable<Reporter['onTestModuleCollected']>>[0];
type TestCaseArg = Parameters<NonNullable<Reporter['onTestCaseResult']>>[0];

export default class CustomReporter implements Reporter {
  private total = 0;
  private passed = 0;
  private failed = 0;

  onTestModuleCollected(testModule: TestModuleArg) {
    const countTests = (suite: unknown): number => {
      let count = 0;
      const s = suite as { children?: Iterable<unknown> };
      if (s?.children) {
        for (const child of s.children) {
          const c = child as { type?: string };
          if (c.type === 'test') count++;
          else count += countTests(child);
        }
      }
      return count;
    };
    this.total += countTests(testModule);
  }

  onTestRunStart() {
    this.total = 0;
    this.passed = 0;
    this.failed = 0;
    console.log(`\n======================== Frontend Test Session ========================`);
  }

  onTestCaseResult(testCase: TestCaseArg) {
    const tc = testCase as { name?: string; result?: { state?: string; duration?: number } | (() => { state?: string; duration?: number }) };
    const res = typeof tc.result === 'function' ? tc.result() : tc.result;
    if (res?.state === 'passed') {
      this.passed++;
      const duration = res.duration ? ` (${Math.round(res.duration)}ms)` : '';
      console.log(`  ✓ [${this.passed} out of ${this.total} passed] ${tc.name}${duration}`);
    } else if (res?.state === 'failed') {
      this.failed++;
      console.log(`  ✗ [FAILED] ${tc.name}`);
    }
  }

  onTestRunEnd() {
    console.log(`==========================================================================`);
    console.log(`Frontend Results: ${this.passed} out of ${this.total} passed${this.failed > 0 ? `, ${this.failed} failed` : ''}\n`);
  }
}
