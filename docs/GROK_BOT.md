# Grok Bot concept (reference only)

This separate monitoring concept is outside the corrected four-board implementation scope in [hackathon-scope.md](hackathon-scope.md). It is not an active milestone or a submission blocker unless the user expands scope.

Grok Bot watches Gemini prediction-market families used in Thesis, compares listed threshold odds with a confirmed range view, and tells the operator when the implied interval has moved enough to revisit evidence. It does not place trades, accept quotes, or sign Arc transactions. The operator still confirms the view and accepts a funded maker quote in the app. Export the Grok Bot thread used to set that watch and keep it with the submission.
