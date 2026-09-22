# AXpulse-S: Multi-Tenant Social Dispatcher & High-Fidelity Router

**APEX Consilium & Médica Frontera — Zero-Make Architecture**

AXpulse-S is the central social routing engine for APEX Consilium and Médica Frontera, replacing legacy automation tools (Make.com/Zapier) with direct, first-party API integrations:

1. **Meta Graph API / Zernio API**: Direct, low-latency publication to Facebook and Instagram without third-party middleware.
2. **TikTok Developers v2 (Content Posting API)**: Direct video publication via `PULL_FROM_URL` or direct chunked upload.
3. **Remotion 4.0 Kinetic Engine**: Native handling of clinical explainer videos (9:16 vertical, subtitles, audio/voiceover).
4. **COFEPRIS Compliance Guard**: Enforces mandatory legal disclaimers (COFEPRIS: 2407012002A00464) on all medical/clinical outbound assets.
5. **Telegram Real-Time Dispatcher**: Direct incident alerting to `@AXWorks_bot`.

## Endpoints

- `GET /api/axpulse-s/status` — Operational health and configured adapters.
- `POST /api/axpulse-s/ingress` — Universal ingress router for all tenants.
- `POST /api/axpulse-s/dispatch-clinical-post` — Specialized endpoint for COFEPRIS-validated medical communications.
- `POST /api/axpulse-s/alert` — Hot-lead and critical incident router to Telegram.

## Environment Variables

- `PORT` (default: `3099`)
- `FABRIC_STUDIO_URL` (default: `https://apex-fabric-studio.onrender.com`)
- `TIKTOK_ACCESS_TOKEN` (TikTok OAuth User Access Token)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
