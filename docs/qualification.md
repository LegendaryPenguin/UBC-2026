# Integration qualification

| Capability | Environment | Evidence | Status |
| --- | --- | --- | --- |
| Arc network | Public testnet RPC | `eth_chainId` returned `0x4cef52` (5042002). [Arc network details](https://docs.arc.io/arc/references/connect-to-arc) | Verified November 14, 2026 |
| USDC ERC-20 units | Arc testnet | `decimals()` returned 6 at `0x3600000000000000000000000000000000000000`. Arc documents 18 decimals for native gas. [Arc network details](https://docs.arc.io/arc/references/connect-to-arc) | Verified November 14, 2026 |
| Gemini discovery | Public API | The market browser now supports the documented events, upcoming, recently-settled, and event-detail endpoints. A direct public API request failed because `api.gemini.com` did not resolve from the development environment on November 14, 2026. [Gemini Markets API](https://developer.gemini.com/prediction-markets-spec/markets) | Live inventory, current schema, and settlement compatibility remain unverified |
| Arc escrow execution | Arc testnet | The repository includes source and a deployment script. The local environment has no configured escrow address. | Deployment, funded maker, acceptance and claim unverified |
| Paper research | Local app | Recorded walkthrough fixtures are in `fixtures/`. Paper quotes have no maker signature or chain receipt. | Local only |
| ElevenLabs voice | Local development | Server-side Scribe v2 transcription and text-to-speech. Microphone capture is user initiated and the app does not persist recordings. [Speech-to-text API](https://elevenlabs.io/docs/api-reference/speech-to-text/convert), [text-to-speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) | Key configured locally. A one-word text-to-speech request returned audio. Transcription and account retention settings unverified |
| QuickNode Streams | Provider webhook | The repository contains a signed-secret handler. | Credentials and deployed Stream configuration unverified |

Before opening a family for live quotes, record the exact Gemini event and contract terms, the observation rule, consistent threshold semantics, the trade cutoff, and how cancellation and correction affect settlement. Confirm that the deployed escrow has the approved family and enough maker collateral, then verify that position recording reconciles the actual Arc acceptance receipt.
