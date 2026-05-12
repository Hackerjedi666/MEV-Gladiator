// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title Coliseum
/// @notice Registry + scorekeeper for MEV Gladiator Pit searchers.
/// @dev The coordinator EOA is the sole authority that records extractions.
///      Display-name byte rules mirror the shared package (ASCII printable, length 1..24).
contract Coliseum {
    struct BotInfo {
        string displayName;
        uint256 totalExtracted;
        uint256 kills;
        uint256 gasSpent;
        uint64 registeredAt;
        bool exists;
    }

    address public owner;
    bool public roundActive;
    uint256 public currentRoundId;

    address[] private _botList;
    mapping(address => BotInfo) private _bots;

    uint256 public constant DISPLAY_NAME_MIN = 1;
    uint256 public constant DISPLAY_NAME_MAX = 24;

    event BotRegistered(address indexed bot, string displayName, uint64 registeredAt);
    event RoundStarted(uint256 indexed roundId, uint64 startedAt);
    event RoundEnded(uint256 indexed roundId, address winner, uint64 endedAt);
    event ExtractionRecorded(
        address indexed searcher,
        uint256 indexed roundId,
        uint256 victimId,
        uint256 amountExtracted,
        uint256 gasSpent,
        string trashTalk
    );
    event OwnerTransferred(address indexed oldOwner, address indexed newOwner);

    error NotOwner();
    error AlreadyRegistered();
    error NotRegistered();
    error BadDisplayName();
    error RoundAlreadyActive();
    error RoundNotActive();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _owner) {
        require(_owner != address(0), "Coliseum: ZERO_OWNER");
        owner = _owner;
        emit OwnerTransferred(address(0), _owner);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Coliseum: ZERO_OWNER");
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Register the caller as a searcher with a display name.
    function registerBot(string calldata displayName) external {
        if (_bots[msg.sender].exists) revert AlreadyRegistered();
        if (!_validName(displayName)) revert BadDisplayName();

        _bots[msg.sender] = BotInfo({
            displayName: displayName,
            totalExtracted: 0,
            kills: 0,
            gasSpent: 0,
            registeredAt: uint64(block.timestamp),
            exists: true
        });
        _botList.push(msg.sender);

        emit BotRegistered(msg.sender, displayName, uint64(block.timestamp));
    }

    /// @notice Coordinator-only: record an extraction event.
    function recordExtraction(
        address searcher,
        uint256 victimId,
        uint256 amountExtracted,
        uint256 gasSpent,
        string calldata trashTalk
    ) external onlyOwner {
        if (!_bots[searcher].exists) revert NotRegistered();
        if (!roundActive) revert RoundNotActive();

        BotInfo storage b = _bots[searcher];
        b.totalExtracted += amountExtracted;
        b.kills += 1;
        b.gasSpent += gasSpent;

        emit ExtractionRecorded(searcher, currentRoundId, victimId, amountExtracted, gasSpent, trashTalk);
    }

    function startRound() external onlyOwner {
        if (roundActive) revert RoundAlreadyActive();
        currentRoundId += 1;
        roundActive = true;
        emit RoundStarted(currentRoundId, uint64(block.timestamp));
    }

    function endRound(address winner) external onlyOwner {
        if (!roundActive) revert RoundNotActive();
        roundActive = false;
        emit RoundEnded(currentRoundId, winner, uint64(block.timestamp));
    }

    function getBotCount() external view returns (uint256) {
        return _botList.length;
    }

    function getBotAt(uint256 index) external view returns (address) {
        return _botList[index];
    }

    function getBotInfo(address bot)
        external
        view
        returns (
            string memory displayName,
            uint256 totalExtracted,
            uint256 kills,
            uint256 gasSpent,
            uint64 registeredAt,
            bool exists
        )
    {
        BotInfo storage b = _bots[bot];
        return (b.displayName, b.totalExtracted, b.kills, b.gasSpent, b.registeredAt, b.exists);
    }

    /// @notice Address list + totalExtracted for client-side sorting.
    function getLeaderboard() external view returns (address[] memory addrs, uint256[] memory totals) {
        uint256 n = _botList.length;
        addrs = new address[](n);
        totals = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            address a = _botList[i];
            addrs[i] = a;
            totals[i] = _bots[a].totalExtracted;
        }
    }

    /// @dev ASCII printable, length DISPLAY_NAME_MIN..DISPLAY_NAME_MAX, no leading/trailing whitespace.
    function _validName(string calldata name) private pure returns (bool) {
        bytes calldata b = bytes(name);
        uint256 len = b.length;
        if (len < DISPLAY_NAME_MIN || len > DISPLAY_NAME_MAX) return false;
        // first and last must not be space (0x20)
        if (b[0] == 0x20 || b[len - 1] == 0x20) return false;
        for (uint256 i = 0; i < len; i++) {
            bytes1 c = b[i];
            if (uint8(c) < 0x20 || uint8(c) > 0x7E) return false;
        }
        return true;
    }
}
