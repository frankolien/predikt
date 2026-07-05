// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/**
 * @title PredictionPool
 * @notice A self-custodial football prediction sweepstake for ONE fixture.
 *
 * Nobody custodies the pot — this contract does. Fans deposit a fixed USDt
 * stake together with their predicted scoreline. After kickoff, a designated
 * `settler` (result oracle) posts the final score; the contract then pays the
 * whole pot, BY RULE, to everyone who called the correct outcome (pro-rata to
 * stake). The settler can only report a score — it can never redirect funds.
 *
 * Safety valve: if the match is never settled, anyone can trigger full refunds
 * after `refundDeadline`, so funds can't be trapped.
 */
contract PredictionPool {
    enum Outcome { Home, Draw, Away }

    struct Entry {
        uint8 homeGoals;
        uint8 awayGoals;
        uint256 amount;
        bool exists;
    }

    IERC20 public immutable token;
    address public immutable settler;
    uint256 public immutable stake;      // fixed buy-in per fan, in token base units
    uint64  public immutable lockTime;   // no deposits at/after this (kickoff)
    uint64  public immutable refundDeadline;
    bytes32 public immutable fixtureId;

    address[] public players;
    mapping(address => Entry) public entries;
    uint256 public pot;

    bool public settled;
    bool public refunded;
    uint8 public finalHome;
    uint8 public finalAway;

    uint256 private _lock; // minimal reentrancy guard

    event Joined(address indexed player, uint8 homeGoals, uint8 awayGoals, uint256 amount);
    event Settled(uint8 homeGoals, uint8 awayGoals, Outcome outcome, uint256 pot, uint256 winners);
    event Payout(address indexed player, uint256 amount, bool won, bool exactScore);
    event Refunded(address indexed player, uint256 amount);

    modifier nonReentrant() {
        require(_lock == 0, "reentrant");
        _lock = 1;
        _;
        _lock = 0;
    }

    constructor(
        address _token,
        address _settler,
        uint256 _stake,
        uint64 _lockTime,
        uint64 _refundDeadline,
        bytes32 _fixtureId
    ) {
        require(_token != address(0) && _settler != address(0), "zero addr");
        require(_stake > 0, "zero stake");
        require(_refundDeadline > _lockTime, "bad deadlines");
        token = IERC20(_token);
        settler = _settler;
        stake = _stake;
        lockTime = _lockTime;
        refundDeadline = _refundDeadline;
        fixtureId = _fixtureId;
    }

    /// @notice Join the pool with your predicted scoreline. Requires prior approve() of `stake`.
    function deposit(uint8 homeGoals, uint8 awayGoals) external nonReentrant {
        require(block.timestamp < lockTime, "pool locked");
        require(!settled && !refunded, "closed");
        require(!entries[msg.sender].exists, "already joined");
        require(token.transferFrom(msg.sender, address(this), stake), "USDT transferFrom failed");

        entries[msg.sender] = Entry(homeGoals, awayGoals, stake, true);
        players.push(msg.sender);
        pot += stake;
        emit Joined(msg.sender, homeGoals, awayGoals, stake);
    }

    /// @notice Oracle posts the final score; contract distributes the pot by rule.
    function settle(uint8 homeGoals, uint8 awayGoals) external nonReentrant {
        require(msg.sender == settler, "not settler");
        require(!settled && !refunded, "already closed");
        settled = true;
        finalHome = homeGoals;
        finalAway = awayGoals;

        Outcome actual = _outcome(homeGoals, awayGoals);

        uint256 winnerStakeSum;
        uint256 n = players.length;
        for (uint256 i = 0; i < n; i++) {
            Entry storage e = entries[players[i]];
            if (_outcome(e.homeGoals, e.awayGoals) == actual) winnerStakeSum += e.amount;
        }

        emit Settled(homeGoals, awayGoals, actual, pot, winnerStakeSum == 0 ? 0 : _winnerCount(actual));

        if (winnerStakeSum == 0) {
            // Nobody called it — refund every fan their stake.
            for (uint256 i = 0; i < n; i++) {
                address p = players[i];
                uint256 amt = entries[p].amount;
                if (amt > 0) {
                    entries[p].amount = 0;
                    token.transfer(p, amt);
                    emit Payout(p, amt, false, false);
                }
            }
            return;
        }

        // Pay pro-rata to correct-outcome callers; last winner absorbs dust so the pot is exact.
        uint256 distributed;
        int256 lastWinner = -1;
        for (uint256 i = 0; i < n; i++) {
            address p = players[i];
            Entry storage e = entries[p];
            bool won = _outcome(e.homeGoals, e.awayGoals) == actual;
            bool exact = e.homeGoals == homeGoals && e.awayGoals == awayGoals;
            if (won) {
                uint256 share = (pot * e.amount) / winnerStakeSum;
                distributed += share;
                lastWinner = int256(i);
                token.transfer(p, share);
                emit Payout(p, share, true, exact);
            } else {
                emit Payout(p, 0, false, exact);
            }
        }
        uint256 dust = pot - distributed;
        if (dust > 0 && lastWinner >= 0) {
            token.transfer(players[uint256(lastWinner)], dust);
        }
    }

    /// @notice Safety valve: if never settled, anyone can refund all after the deadline.
    function refundAll() external nonReentrant {
        require(!settled && !refunded, "closed");
        require(block.timestamp >= refundDeadline, "too early");
        refunded = true;
        uint256 n = players.length;
        for (uint256 i = 0; i < n; i++) {
            address p = players[i];
            uint256 amt = entries[p].amount;
            if (amt > 0) {
                entries[p].amount = 0;
                token.transfer(p, amt);
                emit Refunded(p, amt);
            }
        }
    }

    // ---- views ----
    function playerCount() external view returns (uint256) {
        return players.length;
    }

    function getPlayers() external view returns (address[] memory) {
        return players;
    }

    function getEntry(address who)
        external
        view
        returns (uint8 homeGoals, uint8 awayGoals, uint256 amount, bool exists)
    {
        Entry storage e = entries[who];
        return (e.homeGoals, e.awayGoals, e.amount, e.exists);
    }

    // ---- internal ----
    function _outcome(uint8 h, uint8 a) internal pure returns (Outcome) {
        if (h > a) return Outcome.Home;
        if (h < a) return Outcome.Away;
        return Outcome.Draw;
    }

    function _winnerCount(Outcome actual) internal view returns (uint256 c) {
        uint256 n = players.length;
        for (uint256 i = 0; i < n; i++) {
            Entry storage e = entries[players[i]];
            if (_outcome(e.homeGoals, e.awayGoals) == actual) c++;
        }
    }
}
