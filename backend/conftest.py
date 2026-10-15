import sys

# Ensure UTF-8 output on Windows terminal
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

_tracker = {
    "total": 0,
    "passed": 0,
    "failed": 0
}

def pytest_collection_finish(session):
    _tracker["total"] = len(session.items)
    _tracker["passed"] = 0
    _tracker["failed"] = 0
    print("\n======================== Backend Test Session ========================")

def pytest_runtest_logreport(report):
    if report.when == "call":
        test_name = report.nodeid.split("::")[-1]
        if report.passed:
            _tracker["passed"] += 1
            print(f"  ✓ [{_tracker['passed']} out of {_tracker['total']} passed] {test_name}")
        elif report.failed:
            _tracker["failed"] += 1
            print(f"  ✗ [FAILED] {test_name}")

def pytest_sessionfinish(session, exitstatus):
    print("==========================================================================")
    status_str = f"Backend Results: {_tracker['passed']} out of {_tracker['total']} passed"
    if _tracker["failed"] > 0:
        status_str += f", {_tracker['failed']} failed"
    print(f"{status_str}\n")
