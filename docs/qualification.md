# Integration qualification

| Capability | Environment | Evidence | Status |
| --- | --- | --- | --- |
| Arc network | Public testnet RPC | `eth_chainId` returned `0x4cef52` (5042002). [Arc network details](https://docs.arc.io/arc/references/connect-to-arc) | Verified November 14, 2026 |
| USDC ERC-20 units | Arc testnet | `decimals()` returned 6 at `0x3600000000000000000000000000000000000000`. Arc documents 18 decimals for native gas. [Arc network details](https://docs.arc.io/arc/references/connect-to-arc) | Verified November 14, 2026 |
| Gemini discovery | Public API | The event request failed at the upstream connection on November 14, 2026. [Gemini Markets API](https://developer.gemini.com/prediction-markets-spec/markets) | Live inventory and settlement compatibility unverified |
| Arc escrow execution | Arc testnet | The repository includes source and a deployment script. The local environment has no configured escrow address. | Deployment, funded maker, acceptance and claim unverified |
| Paper research | Local app | Recorded walkthrough fixtures are in `fixtures/`. Paper quotes have no maker signature or chain receipt. | Local only |
| Voice and event indexing | ElevenLabs and QuickNode | The repository contains provider handlers. | Provider credentials and end-to-end configuration unverified |

Before opening a family for live quotes, record the exact Gemini event and contract terms, the observation rule, consistent threshold semantics, the trade cutoff, and how cancellation and correction affect settlement. Confirm that the deployed escrow has the approved family and enough maker collateral, then verify that position recording reconciles the actual Arc acceptance receipt.
