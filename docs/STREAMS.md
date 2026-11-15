QuickNode Streams is the intended Arc event pipeline.

- Network: Arc testnet (chain id 5042002), subject to Streams support on the plan
- Dataset: receipts/logs
- Filter: ThesisEscrow address; events QuoteAccepted, Resolved, Voided, Claimed, BoughtBack
- Destination: POST /api/streams
- Why: in-order position timeline and claim notifications without polling

Streams never decides Gemini outcomes and never authorizes payouts. Direct RPC remains the claim path if the indexer is behind.
