# Evidence — real delegated inference

**Reproduce:** `node scripts/verify_delegation.mjs`
**Captured:** 2026-06-11 · `darwin` · `runtime=node` · `@qvac/sdk@0.12.2`

Two independent `@qvac/sdk` peers run on one host. The consumer delegates to the
provider's Ed25519 key with **`fallbackToLocal: false`**, so any output proves the
round-trip went over the QVAC P2P/DHT delegation path — the provider's
`[request-lifecycle] … kind=completion` lines confirm the compute executed there.

> ⚠️ Timings are **loopback** (both peers on the same machine) — they prove the
> pipeline, not phone-over-Wi-Fi latency.

```text
[provider] 🎯 Provider is listening and ready to accept connections
[provider] PROVIDER_KEY=558ed274dab8a0251fcd7ca13bf3e12d69f397916f570415a5a17cc5279a52c1
[consumer] 📤 Sending delegated loadModel request to provider: 558ed274…52c1 (forcing new connection)
[consumer] 🔗 Establishing direct DHT connection to peer: 558ed274…52c1
[consumer] 🍺 Peer connection opened: 558ed274…52c1
[provider] 📡 New connection established from: ae5dc0bf…
[provider] [request-lifecycle] begin requestId=4167c9f3… kind=loadModel state=running
[provider] Loading from registry: unsloth/Llama-3.2-1B-Instruct-GGUF/…/Llama-3.2-1B-Instruct-Q4_0.gguf
[provider] llamacpp-completion model 81e5c350f7721fec loaded
[consumer] ✅ Delegated model registered: 81e5c350f7721fec -> provider: 558ed274…52c1

----- DELEGATED OUTPUT -----
[provider] [request-lifecycle] begin requestId=582ec747… kind=completion modelId=81e5c350f7721fec state=running
An offline mesh network … helps first responders in emergency situations by
providing them with a means of communication and connectivity even when the
primary network is down or unavailable … ultimately saving lives and reducing
response times.
[provider] [request-lifecycle] end … kind=completion state=completed durationMs=508
----- /DELEGATED OUTPUT -----

RESULT ttft=116ms total=526ms tokens=76 tok/s=144.5
SUCCESS — real delegated token stream captured (on-device fallback was disabled).
```
