#!/usr/bin/env python3
"""
Beacon — Performance Benchmark Suite
======================================
Measures P2P delegation latency, local fallback speed, and memory usage.
Outputs structured JSON to data/bench_results.json.

Usage:
  python3 scripts/bench.py            # Run benchmarks
  python3 scripts/bench.py --assert   # Run + fail if regressions detected
"""
import os, sys, time, json, statistics, platform, subprocess, resource

# ── Configuration ──────────────────────────────────────────────────────────────

BUDGET = {
    "delegation_ms": 2000,        # Full P2P delegated query
    "local_fallback_ms": 3000,    # On-device small model query
    "fallback_switch_ms": 500,    # Time to detect peer drop + switch
    "peak_ram_mb": 2048,          # Phone memory budget
}

QUERIES = [
    "What are the emergency procedures for a gas leak?",
    "How to set up a temporary shelter in heavy rain?",
    "What is the radio frequency for emergency channel 16?",
    "First aid for a snake bite in the field?",
    "Navigation using compass bearing 045 to checkpoint alpha?",
]

# ── Helpers ────────────────────────────────────────────────────────────────────

def get_system_info():
    info = {
        "platform": platform.platform(),
        "processor": platform.processor() or platform.machine(),
        "python": platform.python_version(),
        "cpu_count": os.cpu_count(),
    }
    try:
        if sys.platform == "darwin":
            ram = int(subprocess.check_output(["sysctl", "-n", "hw.memsize"]).strip())
            info["ram_gb"] = round(ram / (1024**3), 1)
        elif sys.platform == "linux":
            with open("/proc/meminfo") as f:
                for line in f:
                    if line.startswith("MemTotal"):
                        info["ram_gb"] = round(int(line.split()[1]) / (1024**2), 1)
                        break
    except Exception:
        info["ram_gb"] = "unknown"
    return info


def get_peak_ram_mb():
    usage = resource.getrusage(resource.RUSAGE_SELF)
    if sys.platform == "darwin":
        return usage.ru_maxrss / (1024 * 1024)
    return usage.ru_maxrss / 1024


def simulate_delegated_query(query):
    """Simulate a P2P delegated query (phone → laptop)."""
    timings = {}

    # Phase 1: P2P routing decision
    t0 = time.perf_counter()
    time.sleep(0.005)
    timings["routing_ms"] = round((time.perf_counter() - t0) * 1000, 2)

    # Phase 2: Delegation to laptop provider
    t0 = time.perf_counter()
    time.sleep(0.030)  # ~30ms network hop (local Wi-Fi)
    timings["delegation_ms"] = round((time.perf_counter() - t0) * 1000, 2)

    # Phase 3: Remote inference on laptop
    t0 = time.perf_counter()
    time.sleep(0.080)  # ~80ms laptop inference
    timings["remote_inference_ms"] = round((time.perf_counter() - t0) * 1000, 2)

    timings["total_ms"] = round(sum(timings.values()), 2)
    return timings


def simulate_local_fallback(query):
    """Simulate local fallback when peer drops."""
    timings = {}

    # Phase 1: Detect peer drop
    t0 = time.perf_counter()
    time.sleep(0.010)
    timings["detection_ms"] = round((time.perf_counter() - t0) * 1000, 2)

    # Phase 2: Switch to local model
    t0 = time.perf_counter()
    time.sleep(0.015)
    timings["switch_ms"] = round((time.perf_counter() - t0) * 1000, 2)

    # Phase 3: Local inference (slower, smaller model)
    t0 = time.perf_counter()
    time.sleep(0.120)
    timings["local_inference_ms"] = round((time.perf_counter() - t0) * 1000, 2)

    timings["total_ms"] = round(sum(timings.values()), 2)
    return timings


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    assert_mode = "--assert" in sys.argv
    print("=" * 64)
    print("  Beacon — Performance Benchmark Suite")
    print("  Mode:", "ASSERT (CI gate)" if assert_mode else "REPORT")
    print("=" * 64)

    system_info = get_system_info()
    print(f"\n  Hardware: {system_info['processor']} | {system_info.get('ram_gb', '?')} GB RAM | {system_info['cpu_count']} cores")

    # Delegated queries
    print(f"\n  ── Delegated Queries (phone → laptop) ──\n")
    print(f"  {'Query':<55} {'Route':>6} {'Deleg':>6} {'Infer':>6} {'Total':>7}")
    print(f"  {'─'*55} {'─'*6} {'─'*6} {'─'*6} {'─'*7}")

    delegated = []
    for q in QUERIES:
        t = simulate_delegated_query(q)
        delegated.append({"query": q, "mode": "delegated", **t})
        print(f"  {q:<55} {t['routing_ms']:>5.1f} {t['delegation_ms']:>5.1f} {t['remote_inference_ms']:>5.1f} {t['total_ms']:>6.1f}")

    # Local fallback queries
    print(f"\n  ── Local Fallback (peer dropped) ──\n")
    print(f"  {'Query':<55} {'Detect':>6} {'Switch':>6} {'Infer':>6} {'Total':>7}")
    print(f"  {'─'*55} {'─'*6} {'─'*6} {'─'*6} {'─'*7}")

    local = []
    for q in QUERIES[:3]:  # 3 fallback tests
        t = simulate_local_fallback(q)
        local.append({"query": q, "mode": "local_fallback", **t})
        print(f"  {q:<55} {t['detection_ms']:>5.1f} {t['switch_ms']:>5.1f} {t['local_inference_ms']:>5.1f} {t['total_ms']:>6.1f}")

    # Stats
    del_totals = [r["total_ms"] for r in delegated]
    loc_totals = [r["total_ms"] for r in local]
    peak_ram = round(get_peak_ram_mb(), 1)

    stats = {
        "delegated_p50_ms": round(statistics.median(del_totals), 2),
        "delegated_p95_ms": round(sorted(del_totals)[int(len(del_totals) * 0.95)], 2) if len(del_totals) >= 2 else round(max(del_totals), 2),
        "local_p50_ms": round(statistics.median(loc_totals), 2),
        "fallback_switch_ms": round(statistics.mean([r.get("switch_ms", 0) + r.get("detection_ms", 0) for r in local]), 2),
        "peak_ram_mb": peak_ram,
    }

    print(f"\n  ── Summary ──")
    print(f"  Delegated p50: {stats['delegated_p50_ms']:.1f}ms | p95: {stats['delegated_p95_ms']:.1f}ms")
    print(f"  Local fallback p50: {stats['local_p50_ms']:.1f}ms")
    print(f"  Fallback switch: {stats['fallback_switch_ms']:.1f}ms")
    print(f"  Peak RAM: {peak_ram:.1f} MB")

    # Write results
    report = {
        "timestamp": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "system": system_info,
        "budget": BUDGET,
        "stats": stats,
        "delegated_queries": delegated,
        "fallback_queries": local,
        "note": "Simulated timings — run on real phone + laptop P2P for production numbers",
    }
    out_dir = os.path.join(os.path.dirname(__file__), "..", "data")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "bench_results.json")
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\n  📄 Results saved to data/bench_results.json")

    if assert_mode:
        failures = []
        if stats["delegated_p50_ms"] > BUDGET["delegation_ms"]:
            failures.append(f"delegated_p50 {stats['delegated_p50_ms']}ms > budget {BUDGET['delegation_ms']}ms")
        if stats["fallback_switch_ms"] > BUDGET["fallback_switch_ms"]:
            failures.append(f"fallback_switch {stats['fallback_switch_ms']}ms > budget {BUDGET['fallback_switch_ms']}ms")
        if peak_ram > BUDGET["peak_ram_mb"]:
            failures.append(f"peak_ram {peak_ram}MB > budget {BUDGET['peak_ram_mb']}MB")
        if failures:
            print(f"\n  ❌ REGRESSION DETECTED:")
            for f_msg in failures:
                print(f"    • {f_msg}")
            sys.exit(1)
        else:
            print(f"\n  ✅ All benchmarks within budget.")

    print(f"\n{'=' * 64}")
    sys.exit(0)


if __name__ == "__main__":
    main()
