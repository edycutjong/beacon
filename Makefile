.PHONY: start provider typecheck ci test bench verify readiness security-scan e2e lighthouse

provider:
	npm run provider

start:
	npm run start

typecheck:
	npm run typecheck

ci:
	npm run ci

test:
	npm run test

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
