.PHONY: help setup start provider typecheck ci test bench verify readiness security-scan e2e lighthouse

help:
	@echo "📡 Beacon P2P Field Assistant - Command Directory"
	@echo "================================================="
	@echo "Available commands:"
	@echo "  make setup            - Install dependencies and seed the database/manual"
	@echo "  make provider         - Boot the P2P compute daemon/provider host"
	@echo "  make start            - Start the Expo development server"
	@echo "  make ci               - Run linting, typechecking, and tests"
	@echo "  make test             - Run Vitest unit & integration tests"
	@echo "  make e2e              - Run Playwright E2E tests"
	@echo "  make verify           - Run offline verification script"
	@echo "  make bench            - Run benchmarks"
	@echo "  make bench-assert     - Run benchmarks with assertion checks"
	@echo "  make readiness        - Run check submission readiness script"
	@echo "  make lighthouse       - Run Lighthouse audit"
	@echo "  make security-scan    - Run security scans"
	@echo "  make screenshots      - Generate App Store/Play Store screenshots"
	@echo "  make demo             - Record automated demo video"
	@echo "  make broll            - Record supplementary B-roll video"

setup:
	npm install
	python3 scripts/seed.py

provider:
	npm run provider

start:
	npm run start

ci:
	npm run ci

test:
	npm run test:coverage

bench:
	python3 scripts/bench.py

bench-assert:
	python3 scripts/bench.py --assert

verify:
	python3 scripts/verify_offline.py

readiness:
	python3 scripts/check_submission_readiness.py

e2e:
	@echo "🎭 Running Playwright E2E tests (demo mode)..."
	npx playwright test

lighthouse:
	@echo "🔦 Running Lighthouse CI audit..."
	npx lhci autorun

security-scan:
	npx trufflehog filesystem . --only-verified 2>/dev/null || echo "Install trufflehog for secret scanning"
	npm audit --audit-level=high || true

screenshots:
	npx tsx scripts/take-screenshots.ts

demo:
	npx tsx scripts/record-demo.ts

broll:
	npx tsx scripts/record-broll.ts
