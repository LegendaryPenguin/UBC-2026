# Thesis

Thesis turns a prediction-market view into an explicit payoff table. In the recorded walkthrough, you can compare a custom BTC range payoff with threshold tickets that can still pay above your upper bound.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Next.js. Choose **Replay** to inspect the recorded Gemini markets. On a topic page, the voice panel can record a question, transcribe it with ElevenLabs, and read the written research reply aloud. Microphone permission is requested only when you start recording. Audio is sent to ElevenLabs for transcription and is not saved by this app. Provider logging follows your ElevenLabs account settings.

Open **Gemini markets** from the More menu to browse the public event, upcoming, and recently settled endpoints. Event detail pages show the Gemini response's contract instruments, reference prices, terms links, and any resolution metadata Gemini returned. Choose **Live data** in the header to request current data. If the public API cannot be reached, switch back to Replay for the recorded walkthrough. Gemini market prices are reference data and do not enable Arc quote acceptance.

To simulate a position, sign in with a throwaway email and the code shown by the local development app, select **Paper**, then open the BTC topic from Explore. Create and confirm a view, choose a maximum payout, request a simulated quote, inspect its terms, and accept it. Portfolio shows paper positions. Saved and confirmed views appear in revision history, where an earlier version can be restored as a separate draft. To walk through settlement, repeat with the archived XRP topic and claim the paper payout after acceptance. The local store lives in `.data/`.

```sh
npm run typecheck
npm test
npm run build
```

For the Solidity suite, use Foundry from `contracts/` with `forge-std` installed, then run `forge test`.

## Economics and risk

A payoff table sets a USDC payout for each mutually exclusive outcome. The escrow design locks the maker's maximum payout alongside the buyer's premium on acceptance. After resolution, the holder receives the recorded payout and the maker receives the residual and premium. Fees can increase the buyer's loss. The design relies on maker collateral and an authorized resolver reporting the source outcome. Early exit requires an available buyback offer.

Arc testnet uses chain ID `5042002`. The verified USDC ERC-20 interface at `0x3600000000000000000000000000000000000000` uses six decimals. Native gas uses 18 decimals. The escrow address and end-to-end deployment remain unverified. [Arc testnet configuration](https://docs.arc.io/arc/references/connect-to-arc)

Live quotes and position recording require a qualified Gemini family, a funded Arc escrow, and verified receipt reconciliation. The local walkthrough uses archived Gemini data and simulated positions. Voice requires `ELEVENLABS_API_KEY` in your ignored local `.env.local` file. The local integration uses ElevenLabs speech to text and text to speech, with editable transcripts and a written equivalent. See [integration qualification](docs/qualification.md) for the verification record.

## References

[Project Lynx](https://github.com/edubizh/ETHNYC2026-project-lynx) and [Cumulant](https://github.com/notveiker/EG-Arc-Cumulant) informed the research and structured-payoff design.
