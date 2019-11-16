// Pool.sol
// - mints a pool share when someone donates tokens
// - syncs with James proposal queue to mint bonds for grantees
// - allows donors to withdraw tokens at any time

pragma solidity 0.5.3;

import "./James.sol";
import "./oz/SafeMath.sol";
import "./oz/IERC20.sol";

contract JamesPoole {
    using SafeMath for uint256;

    event Sync (
        uint256 currentProposalIndex
    );

    event Deposit (
        address donor,
        uint256 bondsMinted,
        uint256 tokensDeposited
    );

    event Withdraw (
        address donor,
        uint256 bondsBurned
    );

    event KeeperWithdraw (
        address donor,
        uint256 bondsBurned,
        address keeper
    );

    event AddKeepers (
        address donor,
        address[] addedKeepers
    );

    event RemoveKeepers (
        address donor,
        address[] removedKeepers
    );

    event SharesMinted (
        uint256 bondsToMint,
        address recipient,
        uint256 totalPoolShares
    );

    event SharesBurned (
        uint256 bondsToBurn,
        address recipient,
        uint256 totalPoolShares
    );

    uint256 public totalPoolShares = 0; // the total bonds outstanding of the pool
    uint256 public currentProposalIndex = 0; // the james proposal index that this pool has been synced to

    James public james; // james contract reference
    IERC20 public approvedToken; // approved token contract reference (copied from james contract)

    bool locked; // prevent re-entrancy

    uint256 constant MAX_NUMBER_OF_SHARES = 10**30; // maximum number of bonds that can be minted

    struct Donor {
        uint256 bonds;
        mapping (address => bool) keepers;
    }

    // the amount of bonds each pool shareholder has
    mapping (address => Donor) public donors;

    modifier active {
        require(totalPoolShares > 0, "JamesPool: Not active");
        _;
    }

    modifier noReentrancy() {
        require(!locked, "JamesPool: Reentrant call");
        locked = true;
        _;
        locked = false;
    }

    constructor(address _james) public {
        james = James(_james);
        approvedToken = IERC20(james.approvedToken());
    }

    function activate(uint256 initialTokens, uint256 initialPoolShares) public noReentrancy {
        require(totalPoolShares == 0, "JamesPool: Already active");

        require(
            approvedToken.transferFrom(msg.sender, address(this), initialTokens),
            "JamesPool: Initial tokens transfer failed"
        );
        _mintSharesForAddress(initialPoolShares, msg.sender);
    }

    // updates Pool state based on James proposal queue
    // - we only want to mint bonds for grants, which are 0 tribute
    // - mints pool bonds to applicants based on bondsRequested / maxTotalSharesAtYesVote
    // - use maxTotalSharesAtYesVote because:
    //   - cant read bonds at the time of proposal processing (womp womp)
    //   - should be close enough if grant bonds are small relative to total bonds, which they should be
    //   - protects pool contributors if many James members ragequit before the proposal is processed by reducing follow on funding
    //   - e.g. if 50% of James bonds ragequit after someone voted yes, the grant proposal would get 50% less follow-on from the pool
    function sync(uint256 toIndex) public active noReentrancy {
        require(
            toIndex <= james.getProposalQueueLength(),
            "JamesPool: Proposal index too high"
        );

        // declare proposal params
        address applicant;
        uint256 bondsRequested;
        bool processed;
        bool didPass;
        bool aborted;
        uint256 tokenTribute;
        uint256 maxTotalSharesAtYesVote;

        uint256 i = currentProposalIndex;

        while (i < toIndex) {

            (, applicant, bondsRequested, , , , processed, didPass, aborted, tokenTribute, , maxTotalSharesAtYesVote,) = james.proposalQueue(i);

            if (!processed) { break; }

            // passing grant proposal, mint pool bonds proportionally on behalf of the applicant
            if (!aborted && didPass && tokenTribute == 0 && bondsRequested > 0) {
                // This can't revert:
                //   1. maxTotalSharesAtYesVote > 0, otherwise nobody could have voted.
                //   2. bondsRequested is <= 10**18 (see James.sol:172), and
                //      totalPoolShares <= 10**30, so multiplying them is <= 10**48 and < 2**160
                uint256 bondsToMint = totalPoolShares.mul(bondsRequested).div(maxTotalSharesAtYesVote); // for a passing proposal, maxTotalSharesAtYesVote is > 0
                _mintSharesForAddress(bondsToMint, applicant);
            }

            i++;
        }

        currentProposalIndex = i;

        emit Sync(currentProposalIndex);
    }

    // add tokens to the pool, mint new bonds proportionally
    function deposit(uint256 tokenAmount) public active noReentrancy {

        uint256 bondsToMint = totalPoolShares.mul(tokenAmount).div(approvedToken.balanceOf(address(this)));

        require(
            approvedToken.transferFrom(msg.sender, address(this), tokenAmount),
            "JamesPool: Deposit transfer failed"
        );

        _mintSharesForAddress(bondsToMint, msg.sender);

        emit Deposit(
            msg.sender,
            bondsToMint,
            tokenAmount
        );
    }

    // burn bonds to proportionally withdraw tokens in pool
    function withdraw(uint256 bondsToBurn) public active noReentrancy {
        _withdraw(msg.sender, bondsToBurn);

        emit Withdraw(
            msg.sender,
            bondsToBurn
        );
    }

    // keeper burns bonds to withdraw on behalf of the donor
    function keeperWithdraw(uint256 bondsToBurn, address recipient) public active noReentrancy {
        require(
            donors[recipient].keepers[msg.sender],
            "JamesPool: Sender is not a keeper"
        );

        _withdraw(recipient, bondsToBurn);

        emit KeeperWithdraw(
            recipient,
            bondsToBurn,
            msg.sender
        );
    }

    function addKeepers(address[] calldata newKeepers) external active noReentrancy {
        Donor storage donor = donors[msg.sender];

        for (uint256 i = 0; i < newKeepers.length; i++) {
            donor.keepers[newKeepers[i]] = true;
        }

        emit AddKeepers(msg.sender, newKeepers);
    }

    function removeKeepers(address[] calldata keepersToRemove) external active noReentrancy {
        Donor storage donor = donors[msg.sender];

        for (uint256 i = 0; i < keepersToRemove.length; i++) {
            donor.keepers[keepersToRemove[i]] = false;
        }

        emit RemoveKeepers(msg.sender, keepersToRemove);
    }

    function _mintSharesForAddress(uint256 bondsToMint, address recipient) internal {
        totalPoolShares = totalPoolShares.add(bondsToMint);
        donors[recipient].bonds = donors[recipient].bonds.add(bondsToMint);

        require(
            totalPoolShares <= MAX_NUMBER_OF_SHARES,
            "JamesPool: Max number of bonds exceeded"
        );

        emit SharesMinted(
            bondsToMint,
            recipient,
            totalPoolShares
        );
    }

    function _withdraw(address recipient, uint256 bondsToBurn) internal {
        Donor storage donor = donors[recipient];

        require(
            donor.bonds >= bondsToBurn,
            "JamesPool: Not enough bonds to burn"
        );

        uint256 tokensToWithdraw = approvedToken.balanceOf(address(this)).mul(bondsToBurn).div(totalPoolShares);

        totalPoolShares = totalPoolShares.sub(bondsToBurn);
        donor.bonds = donor.bonds.sub(bondsToBurn);

        require(
            approvedToken.transfer(recipient, tokensToWithdraw),
            "JamesPool: Withdrawal transfer failed"
        );

        emit SharesBurned(
            bondsToBurn,
            recipient,
            totalPoolShares
        );
    }

}
