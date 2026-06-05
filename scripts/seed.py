#!/usr/bin/env python3
import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]

# Short, on-device queries (< 200 chars, no media) — should run LOCAL.
LIGHT_QUERIES = [
  "What is the status of the local node?",
  "How much RAM is currently free on this device?",
  "Confirm battery charge levels.",
  "Is the P2P link to the laptop active?",
  "What time is sunset today?",
  "List the supplies in the field kit.",
  "How do I treat a minor cut?",
  "What's the bearing back to base camp?",
]

# Long-context or multimodal queries (> 200 chars or image) — should DELEGATE
# to the laptop peer when one is paired, else fall back to local.
HEAVY_QUERIES = [
  "Calculate the fire risk based on the thermal image logs from sensor 4 in the past 12 hours.",
  "Run a complete multi-modal analysis of the high-resolution aerial photography file.",
  "Perform speech synthesis on a 500-word disaster response checklist.",
  "Given the attached topographic photo, the wind readings from the last six hours, and the soil moisture log, produce a detailed wildfire spread forecast with evacuation routing for the three nearest settlements.",
  "Summarize and cross-reference the full 40-page field medical manual to build a step-by-step protocol for treating crush injuries when no surgeon is available within 12 hours of transport.",
  "Analyze this aerial drone image of the flooded valley and estimate water depth, current direction, and the safest crossing point for a convoy of vehicles.",
]

# Edge cases that exercise the routing boundary (length == 200, just over, etc.).
BORDERLINE_QUERIES = [
  "x" * 200,   # exactly at threshold — NOT heavy (router uses length > 200)
  "y" * 201,   # one over the threshold — heavy
  "",          # empty input
  "   ",       # whitespace only
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

    with open(fixtures / "borderline_queries.txt", "w") as f:
        f.write("\n".join(BORDERLINE_QUERIES) + "\n")

    print(json.dumps({
      "status": "ok",
      "light_queries": len(LIGHT_QUERIES),
      "heavy_queries": len(HEAVY_QUERIES),
      "borderline_queries": len(BORDERLINE_QUERIES),
      "fixtures_dir": str(fixtures)
    }, indent=2))
    return 0

if __name__ == "__main__":
    sys.exit(main())
