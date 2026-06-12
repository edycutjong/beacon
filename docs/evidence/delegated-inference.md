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
[provider] PROVIDER_KEY=d796d1080f5b51c7cc8da568ed06e905f864072870cf4c92ba5ba578474d38f2
[verify] consumer: loadModel with delegate (fallbackToLocal=false)...
[sdk:server] 📤 Sending delegated loadModel request to provider: d796d1080f5b51c7cc8da568ed06e905f864072870cf4c92ba5ba578474d38f2, timeout: 480000ms (forcing new connection)
[sdk:server] 🔗 Establishing direct DHT connection to peer: d796d1080f5b51c7cc8da568ed06e905f864072870cf4c92ba5ba578474d38f2, timeout: 480000ms
[sdk:server] 🍺 Peer connection opened: d796d1080f5b51c7cc8da568ed06e905f864072870cf4c92ba5ba578474d38f2
[provider] [sdk:server] 📡 New connection established from: b0244bbe81c53463...
[provider] [sdk:server] [request-lifecycle] begin requestId=62021742-77eb-4397-915d-5d988c24c795 kind=loadModel modelId=- state=running
[provider] [sdk:server] Loading from registry: unsloth/Llama-3.2-1B-Instruct-GGUF/blob/b69aef112e9f895e6f98d7ae0949f72ff09aa401/Llama-3.2-1B-Instruct-Q4_0.gguf
[provider] [sdk:server] llamacpp-completion model 81e5c350f7721fec loaded
[sdk:server] ✅ Delegated model registered: 81e5c350f7721fec -> provider: d796d1080f5b51c7cc8da568ed06e905f864072870cf4c92ba5ba578474d38f2

----- DELEGATED OUTPUT -----
[provider] [sdk:server] [request-lifecycle] begin requestId=69bcf701-2bb3-4ada-9c60-7052f7bb9c80 kind=completion modelId=81e5c350f7721fec state=running
An offline mesh network, which can operate without internet connectivity, helps first responders by providing a reliable and resilient communication system in areas with limited or no internet coverage, such as rural areas or emergency response zones. By relying on mesh network technology, first responders can maintain communication with each other and with command centers, even in situations where traditional internet-based communication may be disrupted, allowing them to respond more effectively to[provider] [sdk:server] [request-lifecycle] end requestId=69bcf701-2bb3-4ada-9c60-7052f7bb9c80 kind=completion modelId=81e5c350f7721fec state=completed durationMs=611
 emergency situations.
----- /DELEGATED OUTPUT -----

[verify] RESULT ttft=222ms total=627ms tokens=83 tok/s=132.4 (loopback — pipeline proof, not device latency)
[verify] SUCCESS — real delegated token stream captured (on-device fallback was disabled).
```
