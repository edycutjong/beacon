# Beacon — Demo Script

## Setup
1. `npm install && python3 scripts/seed.py`
2. Start laptop provider: `node src/node/provider.ts`
3. Start phone app: `npx expo start --ios`
4. **Enable Airplane Mode** on both devices, connect via Wi-Fi Direct

## Demo Flow (2 min)
1. Show airplane mode ON on both devices
2. Open Beacon on phone — show "LOCAL" badge
3. Pair with laptop provider — show "DELEGATED → Laptop-01"
4. Ask a complex query — show it routes to laptop (faster inference)
5. Disconnect laptop — show automatic fallback to local model
6. Close: "Edge AI isn't about one device. It's about a mesh. QVAC makes that possible."
