// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

/// @title ThesisEscrow
/// @notice Fully collateralized custom-payoff positions. A maker signs an EIP-712
/// quote that commits a finite payout schedule. Accepting the quote locks
/// maxPayout from the maker and premium from the taker. Settlement pays the
/// recorded scenario payout to the holder and residual plus premium to the maker.
contract ThesisEscrow {
    IERC20Minimal public immutable token;
    address public resolver;
    address public operator;
    uint256 public nextId = 1;

    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "Quote(address maker,address taker,address escrow,address token,bytes32 familyHash,bytes32 payoffHash,uint256 maxPayout,uint256 premium,uint256 fee,uint256 nonce,uint256 issuedAt,uint256 deadline,uint256 chainId,uint64 longstop,uint32 finalizationDelay)"
    );

    uint32 public constant FINALIZATION_DELAY = 1 hours;

    struct Quote {
        address maker;
        address taker;
        address escrow;
        address token;
        bytes32 familyHash;
        bytes32 payoffHash;
        uint256 maxPayout;
        uint256 premium;
        uint256 fee;
        uint256 nonce;
        uint256 issuedAt;
        uint256 deadline;
        uint256 chainId;
        uint64 longstop;
        uint32 finalizationDelay;
    }

    enum Status {
        None,
        Open,
        Resolved,
        Voided,
        BoughtBack
    }

    struct Position {
        address maker;
        address holder;
        bytes32 familyHash;
        bytes32 payoffHash;
        uint256 maxPayout;
        uint256 premium;
        uint256 fee;
        uint256 nonce;
        uint64 acceptedAt;
        uint64 resolvedAt;
        uint32 scenarioIndex;
        Status status;
        uint256 payoutCount;
        uint64 longstop;
        uint32 finalizationDelay;
        uint32 proposedScenarioIndex;
        uint64 proposedAt;
        bytes32 proposalEvidenceHash;
    }

    mapping(uint256 => Position) public positions;
    mapping(uint256 => mapping(uint256 => uint256)) public payouts;
    mapping(address => mapping(uint256 => bool)) public usedNonce;
    mapping(address => uint256) public freeCollateral;
    mapping(address => uint256) public reservedCollateral;
    mapping(address => bool) public pausedMakers;

    event CollateralDeposited(address indexed maker, uint256 amount);
    event CollateralWithdrawn(address indexed maker, uint256 amount);
    event QuoteAccepted(uint256 indexed id, address indexed maker, address indexed taker, bytes32 payoffHash, uint256 premium, uint256 maxPayout);
    event OutcomeProposed(uint256 indexed id, uint32 scenarioIndex, bytes32 evidenceHash, uint64 proposedAt, uint64 finalizesAt);
    event Resolved(uint256 indexed id, uint32 scenarioIndex, uint256 buyerPayout, bytes32 evidenceHash);
    event Voided(uint256 indexed id);
    event Claimed(uint256 indexed id, address indexed to, uint256 amount);
    event BoughtBack(uint256 indexed id, uint256 proceeds);
    event MakerPaused(address indexed maker, bool paused);
    event ResolverUpdated(address indexed resolver);
    event OperatorUpdated(address indexed operator);

    error BadSig();
    error Expired();
    error UsedNonce();
    error Paused();
    error BadQuote();
    error BadPayouts();
    error InsufficientMaker();
    error NotHolder();
    error NotMaker();
    error NotResolver();
    error WrongStatus();
    error TransferFailed();
    error NothingToClaim();
    error SettlementNotReady();
    error LongstopReached();
    error BadEvidence();

    constructor(address token_, address resolver_, address operator_) {
        require(token_ != address(0) && resolver_ != address(0), "zero");
        token = IERC20Minimal(token_);
        resolver = resolver_;
        operator = operator_ == address(0) ? msg.sender : operator_;
    }

    modifier onlyResolver() {
        if (msg.sender != resolver) revert NotResolver();
        _;
    }

    function setResolver(address next) external {
        require(msg.sender == operator, "op");
        resolver = next;
        emit ResolverUpdated(next);
    }

    function setOperator(address next) external {
        require(msg.sender == operator, "op");
        operator = next;
        emit OperatorUpdated(next);
    }

    function setMakerPaused(address maker, bool paused) external {
        require(msg.sender == operator, "op");
        pausedMakers[maker] = paused;
        emit MakerPaused(maker, paused);
    }

    function deposit(uint256 amount) external {
        if (amount == 0) revert BadQuote();
        _pull(msg.sender, amount);
        freeCollateral[msg.sender] += amount;
        emit CollateralDeposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external {
        if (freeCollateral[msg.sender] < amount) revert InsufficientMaker();
        freeCollateral[msg.sender] -= amount;
        _push(msg.sender, amount);
        emit CollateralWithdrawn(msg.sender, amount);
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("ThesisEscrow")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function hashQuote(Quote calldata q) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                domainSeparator(),
                keccak256(
                    abi.encode(
                        QUOTE_TYPEHASH,
                        q.maker,
                        q.taker,
                        q.escrow,
                        q.token,
                        q.familyHash,
                        q.payoffHash,
                        q.maxPayout,
                        q.premium,
                        q.fee,
                        q.nonce,
                        q.issuedAt,
                        q.deadline,
                        q.chainId,
                        q.longstop,
                        q.finalizationDelay
                    )
                )
            )
        );
    }

    function accept(Quote calldata q, uint256[] calldata schedule, bytes calldata signature) external returns (uint256 id) {
        if (q.escrow != address(this) || q.token != address(token) || q.chainId != block.chainid) revert BadQuote();
        if (q.taker != address(0) && q.taker != msg.sender) revert BadQuote();
        if (q.maxPayout == 0 || q.deadline < block.timestamp) revert Expired();
        if (
            q.finalizationDelay != FINALIZATION_DELAY ||
            q.longstop <= block.timestamp + q.finalizationDelay || q.deadline >= q.longstop
        ) revert BadQuote();
        if (usedNonce[q.maker][q.nonce]) revert UsedNonce();
        if (pausedMakers[q.maker]) revert Paused();
        if (schedule.length == 0) revert BadPayouts();

        bytes32 computed = keccak256(abi.encode(schedule));
        if (computed != q.payoffHash) revert BadPayouts();

        uint256 maxSeen;
        for (uint256 i; i < schedule.length; i++) {
            if (schedule[i] > q.maxPayout) revert BadPayouts();
            if (schedule[i] > maxSeen) maxSeen = schedule[i];
        }
        if (maxSeen != q.maxPayout) revert BadPayouts();

        bytes32 digest = hashQuote(q);
        address recovered = _recover(digest, signature);
        if (recovered != q.maker) revert BadSig();

        usedNonce[q.maker][q.nonce] = true;
        if (freeCollateral[q.maker] < q.maxPayout) revert InsufficientMaker();
        freeCollateral[q.maker] -= q.maxPayout;
        reservedCollateral[q.maker] += q.maxPayout;

        uint256 takerPay = q.premium + q.fee;
        _pull(msg.sender, takerPay);

        id = nextId++;
        Position storage p = positions[id];
        p.maker = q.maker;
        p.holder = msg.sender;
        p.familyHash = q.familyHash;
        p.payoffHash = q.payoffHash;
        p.maxPayout = q.maxPayout;
        p.premium = q.premium;
        p.fee = q.fee;
        p.nonce = q.nonce;
        p.acceptedAt = uint64(block.timestamp);
        p.status = Status.Open;
        p.payoutCount = schedule.length;
        p.longstop = q.longstop;
        p.finalizationDelay = q.finalizationDelay;
        for (uint256 i; i < schedule.length; i++) {
            payouts[id][i] = schedule[i];
        }
        emit QuoteAccepted(id, q.maker, msg.sender, q.payoffHash, q.premium, q.maxPayout);
    }

    function proposeOutcome(uint256 id, uint32 scenarioIndex, bytes32 evidenceHash) external onlyResolver {
        Position storage p = positions[id];
        if (p.status != Status.Open) revert WrongStatus();
        if (scenarioIndex >= p.payoutCount) revert BadPayouts();
        if (evidenceHash == bytes32(0)) revert BadEvidence();
        uint256 finalizeAt = block.timestamp + p.finalizationDelay;
        if (finalizeAt >= p.longstop) revert LongstopReached();
        p.proposedScenarioIndex = scenarioIndex;
        p.proposedAt = uint64(block.timestamp);
        p.proposalEvidenceHash = evidenceHash;
        emit OutcomeProposed(id, scenarioIndex, evidenceHash, p.proposedAt, uint64(finalizeAt));
    }

    function finalizeOutcome(uint256 id) external {
        Position storage p = positions[id];
        if (p.status != Status.Open) revert WrongStatus();
        if (p.proposedAt == 0 || block.timestamp < uint256(p.proposedAt) + p.finalizationDelay) revert SettlementNotReady();
        if (block.timestamp >= p.longstop) revert LongstopReached();
        p.status = Status.Resolved;
        p.scenarioIndex = p.proposedScenarioIndex;
        p.resolvedAt = uint64(block.timestamp);
        emit Resolved(id, p.scenarioIndex, payouts[id][p.scenarioIndex], p.proposalEvidenceHash);
    }

    function voidPosition(uint256 id) external {
        Position storage p = positions[id];
        if (p.status != Status.Open) revert WrongStatus();
        if (block.timestamp < p.longstop) revert SettlementNotReady();
        p.status = Status.Voided;
        p.resolvedAt = uint64(block.timestamp);
        emit Voided(id);
    }

    function claim(uint256 id) external {
        Position storage p = positions[id];
        if (p.status != Status.Resolved && p.status != Status.Voided) revert WrongStatus();
        if (msg.sender != p.holder && msg.sender != p.maker) revert NotHolder();

        uint256 buyerPay;
        uint256 makerPay;
        if (p.status == Status.Voided) {
            buyerPay = p.premium;
            makerPay = p.maxPayout;
        } else {
            buyerPay = payouts[id][p.scenarioIndex];
            makerPay = p.maxPayout + p.premium - buyerPay;
        }

        p.status = Status.None;
        reservedCollateral[p.maker] -= p.maxPayout;

        if (p.fee > 0) {
            _push(operator, p.fee);
        }
        if (msg.sender == p.holder) {
            if (buyerPay == 0 && makerPay == 0) revert NothingToClaim();
            if (buyerPay > 0) _push(p.holder, buyerPay);
            if (makerPay > 0) _push(p.maker, makerPay);
        } else {
            if (makerPay > 0) _push(p.maker, makerPay);
            if (buyerPay > 0) _push(p.holder, buyerPay);
        }
        emit Claimed(id, msg.sender, buyerPay + makerPay);
    }

    function buyback(uint256 id, uint256 proceeds) external {
        Position storage p = positions[id];
        if (p.status != Status.Open) revert WrongStatus();
        if (msg.sender != p.maker) revert NotMaker();
        _pull(p.maker, proceeds);
        reservedCollateral[p.maker] -= p.maxPayout;
        freeCollateral[p.maker] += p.maxPayout;
        p.status = Status.BoughtBack;
        _push(p.holder, proceeds + p.premium);
        emit BoughtBack(id, proceeds);
    }

    function previewClaim(uint256 id) external view returns (uint256 buyerPay, uint256 makerPay) {
        Position storage p = positions[id];
        if (p.status == Status.Voided) return (p.premium, p.maxPayout);
        if (p.status != Status.Resolved) return (0, 0);
        buyerPay = payouts[id][p.scenarioIndex];
        makerPay = p.maxPayout + p.premium - buyerPay;
    }

    function schedule(uint256 id) external view returns (uint256[] memory rows) {
        Position storage p = positions[id];
        rows = new uint256[](p.payoutCount);
        for (uint256 i; i < p.payoutCount; i++) rows[i] = payouts[id][i];
    }

    function _pull(address from, uint256 amount) internal {
        if (amount == 0) return;
        bool ok = token.transferFrom(from, address(this), amount);
        if (!ok) revert TransferFailed();
    }

    function _push(address to, uint256 amount) internal {
        if (amount == 0) return;
        bool ok = token.transfer(to, amount);
        if (!ok) revert TransferFailed();
    }

    function _recover(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        if (signature.length != 65) revert BadSig();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        return ecrecover(digest, v, r, s);
    }
}
