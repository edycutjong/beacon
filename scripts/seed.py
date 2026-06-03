#!/usr/bin/env python3
import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]

LIGHT_QUERIES = [
  "What is the status of the local node?",
  "How much RAM is currently free on this device?",
  "Confirm battery charge levels."
]

HEAVY_QUERIES = [
  "Calculate the fire risk based on the thermal image logs from sensor 4 in the past 12 hours.",
  "Run a complete multi-modal analysis of the high-resolution aerial photography file.",
  "Perform speech synthesis on a 500-word disaster response checklist."
]

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "data"))
    args = ap.parse_args()
    out = pathlib.Path(args.out)
    fixtures = out / "fixtures"
    fixtures.mkdir(parents=True, exist_ok=True)

    with open(fixtures / "light_queries.txt", "w") as f:
        f.write("\n".join(LIGHT_QUERIES) + "\n")

    with open(fixtures / "heavy_queries.txt", "w") as f:
        f.write("\n".join(HEAVY_QUERIES) + "\n")

    print(json.dumps({
      "status": "ok",
      "light_queries": len(LIGHT_QUERIES),
      "heavy_queries": len(HEAVY_QUERIES),
      "fixtures_dir": str(fixtures)
    }, indent=2))
    return 0

if __name__ == "__main__":
    sys.exit(main())
