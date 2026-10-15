export default class CustomReporter {
  private total = 0;
  private passed = 0;
  private failed = 0;

  onTestModuleCollected(testModule: any) {
    const countTests = (suite: any): number => {
      let count = 0;
      if (suite?.children) {
        for (const child of suite.children) {
          if (child.type === 'test') count++;
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

  onTestCaseResult(testCase: any) {
    const res = typeof testCase.result === 'function' ? testCase.result() : testCase.result;
    if (res?.state === 'passed') {
      this.passed++;
      const duration = res.duration ? ` (${Math.round(res.duration)}ms)` : '';
      console.log(`  ✓ [${this.passed} out of ${this.total} passed] ${testCase.name}${duration}`);
    } else if (res?.state === 'failed') {
      this.failed++;
      console.log(`  ✗ [FAILED] ${testCase.name}`);
    }
  }

  onTestRunEnd() {
    console.log(`==========================================================================`);
    console.log(`Frontend Results: ${this.passed} out of ${this.total} passed${this.failed > 0 ? `, ${this.failed} failed` : ''}\n`);
  }
}
