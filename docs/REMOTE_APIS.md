# Remote APIs

**Beacon makes zero remote/cloud API calls. All inference is on-device (or on a paired local peer) via `@qvac/sdk`.**

Heavy queries are delegated **phone → nearby laptop over local Wi-Fi / Wi-Fi Direct** using QVAC's P2P compute mesh — an encrypted, server-less, LAN-only link. Nothing crosses the internet; there is no cloud LLM, hosted vector DB, or external relay.

## APIs / external interfaces used

| Interface | Type | When | Data sent over the internet |
|---|---|---|---|
| `@qvac/sdk` — `loadModel` (incl. `delegate`), `completion`, `ragSearch`, `unloadModel` | **Local, on-device** | Every query | **None** |
| `@qvac/sdk` — `startQVACProvider` / P2P delegate | **Local-network peer-to-peer** | Heavy queries when a laptop peer is paired | **None** — stays on local Wi-Fi, end-to-end encrypted |
| QVAC model registry / HuggingFace | Network **download only** | First run only | None — fetches open model weights once, then offline |

No analytics, telemetry, or third-party services. After the one-time model download, Beacon runs fully air-gapped (router unplugged / cellular off — it still works via local Wi-Fi).

## How this is enforced (verifiable)

`scripts/verify_offline.py` is part of the evidence bundle and CI:

1. **Cloud-import scan** — fails if the source imports any banned cloud SDK (`openai`, `anthropic`, `googleapis`, `azure`, `aws-sdk`, `pinecone`, `cohere`, `firebase`, `supabase`).
2. **SDK-only check** — confirms inference/delegation go through `@qvac/sdk`.
3. **Network isolation** — run with Wi-Fi/router disconnected; asserts no outbound connectivity.

```bash
# unplug the router / disable cellular first, then:
python3 scripts/verify_offline.py
```

The app's topology indicator shows the live path — `LOCAL` (on-device) vs `DELEGATED → laptop` — and never a cloud endpoint.
