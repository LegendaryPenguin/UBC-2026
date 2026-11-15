QuickNode Streams is the intended Arc event pipeline.

- Network: Arc testnet (chain id 5042002), subject to Streams support on the plan
- Dataset: receipts/logs
- Filter: ThesisEscrow address; events QuoteAccepted, Resolved, Voided, Claimed, BoughtBack
- Destination: POST /api/streams
- Why: in-order position timeline and claim notifications without polling

Configure the destination's Security token as `QUICKNODE_STREAMS_SECRET`. The handler verifies `X-QN-Nonce`, `X-QN-Timestamp`, and `X-QN-Signature` against the decoded UTF-8 JSON body using HMAC-SHA256, rejects timestamps older than five minutes, and records delivery nonces to prevent replay. Gzip bodies are bounded before decoding.

Webhook log entries are treated as transaction pointers. For each escrow log, the handler fetches the receipt from Arc RPC, matches the exact address/topics/data/log index, decodes only known escrow events, and checks the current contract position before updating the inbox. A signed webhook alone never changes the settlement outcome or authorizes a payout. Direct RPC remains the claim/status path if the indexer is behind.

The endpoint is implemented but still needs a configured QuickNode Stream, deployed public endpoint, and a real signed delivery before it is qualified for production.
