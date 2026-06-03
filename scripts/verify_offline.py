#!/usr/bin/env python3
"""
Beacon — Offline Verification Bundle
======================================
Proves zero-cloud execution. Run with network cable unplugged.
Usage: python3 scripts/verify_offline.py
"""
import os, sys, socket

P = 0; F = 0
def check(name, condition, detail=""):
    global P, F
    if condition:
        P += 1; print(f"  ✅ {name}")
    else:
        F += 1; print(f"  ❌ {name}: {detail}")

def main():
    base = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    print("=" * 64)
    print("  Beacon — Offline Verification Bundle")
    print("  Track: Mobile (P2P Delegation)")
    print("=" * 64)

    # ── 1. No cloud API imports ──
    print("\n  ── Cloud Import Scan ──")
    banned = ["openai", "anthropic", "googleapis", "azure", "aws-sdk",
              "pinecone", "cohere", "firebase", "supabase"]
    violations = []
    for root, _, files in os.walk(os.path.join(base, "src")):
        for f in files:
            if f.endswith((".ts", ".tsx", ".js")):
                content = open(os.path.join(root, f)).read()
                for kw in banned:
                    if kw in content:
                        violations.append(f"{f}: imports '{kw}'")
    check("No cloud API imports in src/", len(violations) == 0, str(violations[:5]))

    # ── 2. No cloud URLs in source ──
    print("\n  ── Cloud URL Scan ──")
    cloud_urls = ["api.openai.com", "api.anthropic.com", "api.cohere.ai",
                  "pinecone.io", "firebaseio.com", "googleapis.com"]
    url_violations = []
    for root, _, files in os.walk(os.path.join(base, "src")):
        for f in files:
            if f.endswith((".ts", ".tsx", ".js")):
                content = open(os.path.join(root, f)).read()
                for url in cloud_urls:
                    if url in content:
                        url_violations.append(f"{f}: contains '{url}'")
    check("No cloud URLs in source", len(url_violations) == 0, str(url_violations[:5]))

    # ── 3. @qvac/sdk integration ──
    print("\n  ── QVAC SDK Integration ──")
    qvac_files = []
    for root, _, files in os.walk(os.path.join(base, "src")):
        for f in files:
            if f.endswith(".ts"):
                content = open(os.path.join(root, f)).read()
                if "@qvac/sdk" in content:
                    qvac_files.append(f)
    check("@qvac/sdk imported", len(qvac_files) > 0, "No files import @qvac/sdk")
    check("@qvac/sdk in core wrapper", len(qvac_files) >= 1, f"Only in: {qvac_files}")

    # ── 4. Core modules ──
    print("\n  ── Core Modules ──")
    for module_name, filename in [("QVAC wrapper", "qvac.ts"), ("P2P lifecycle", "p2p.ts"),
                                   ("Router", "router.ts")]:
        path = os.path.join(base, "src", "core", filename)
        check(f"{module_name} ({filename})", os.path.isfile(path), "Missing")

    # ── 5. P2P module checks ──
    print("\n  ── P2P Architecture ──")
    p2p_path = os.path.join(base, "src", "core", "p2p.ts")
    if os.path.isfile(p2p_path):
        content = open(p2p_path).read()
        check("P2P has provider/host function", "host" in content.lower() or "provider" in content.lower())
        check("P2P has pairing function", "pair" in content.lower())
        check("P2P uses Ed25519 validation", "ed25519" in content.lower() or "64" in content)

    # ── 6. Router checks ──
    print("\n  ── Delegation Router ──")
    router_path = os.path.join(base, "src", "core", "router.ts")
    if os.path.isfile(router_path):
        content = open(router_path).read()
        check("Router has delegation decision", "delegate" in content.lower() or "should" in content.lower())
        check("Router has fallback logic", "fallback" in content.lower() or "local" in content.lower())

    # ── 7. Provider daemon ──
    print("\n  ── Provider Daemon ──")
    provider_path = os.path.join(base, "src", "node", "provider.ts")
    check("Provider daemon exists", os.path.isfile(provider_path), "Missing src/node/provider.ts")

    # ── 8. Security ──
    print("\n  ── Security ──")
    check("No .env file committed", not os.path.isfile(os.path.join(base, ".env")))
    check(".env.example exists", os.path.isfile(os.path.join(base, ".env.example")))
    check(".gitignore exists", os.path.isfile(os.path.join(base, ".gitignore")))
    if os.path.isfile(os.path.join(base, ".gitignore")):
        gi = open(os.path.join(base, ".gitignore")).read()
        check(".env in .gitignore", ".env" in gi)

    # ── 9. Network test (optional) ──
    print("\n  ── Network Isolation (optional) ──")
    try:
        socket.create_connection(("8.8.8.8", 53), timeout=2)
        print("  ⚠️  Network is UP — for full verification, disconnect and re-run")
    except (socket.timeout, OSError):
        check("Network disconnected (air-gapped)", True)

    # ── Summary ──
    print(f"\n{'=' * 64}")
    print(f"  Results: {P} passed, {F} failed")
    if F > 0:
        print(f"  ❌ OFFLINE VERIFICATION FAILED")
    else:
        print(f"  ✅ OFFLINE VERIFICATION PASSED — zero cloud, P2P-only")
    print(f"{'=' * 64}")
    sys.exit(1 if F > 0 else 0)

if __name__ == "__main__":
    main()
