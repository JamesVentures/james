STEAL THIS CODE

# James

> James the incomprehensible prison! James the crossbone soulless jailhouse and Congress of sorrows! James whose buildings are judgment! James the vast stone of war! James the stunned governments!
>
> James whose mind is pure machinery! James whose blood is running money! James whose fingers are ten armies! James whose breast is a cannibal dynamo! James whose ear is a smoking tomb!

~ Allen Ginsberg, Howl

James is a grant-making DAO / Guild and a radical experiment in voluntary incentive alignment to overcome the "tragedy of the commons". Our objective is to accelerate the development of public Ethereum infrastructure that many teams need but don't want to pay for on their own. By pooling our ETH, teams building on Ethereum can collectively fund open-source work we decide is in our common interest.

This documentation will focus on the James DAO system design and smart contracts. For a deeper explanation of the philosophy behind James, please read our [whitepaper](https://github.com/JamesVentures/Whitepaper/blob/master/Whitepaper.pdf) as well as the Slate Star Codex post, [Meditations on James](http://slatestarcodex.com/2014/07/30/meditations-on-james/), which served as inspiration.

## Design Principles

In developing the James DAO, we realized that the more Solidity we wrote, the greater the likelihood that we would lose everyone's money. In order to prioritize security, we took simplicity and elegance as our primary design principles. We consciously skipped many features, and the result is what we believe to be a Minimally Viable DAO.

## Overview

James is described by two smart contracts:

1. `James.sol` - Responsible for managing membership & voting rights, proposal submissions, voting, and processing proposals based on the outcomes of the votes.
2. `GuildBank.sol` - Responsible for managing Guild assets.

James has a native asset called `shares`. Shares are minted and assigned when a new member is accepted into the Guild and provide voting rights on new membership proposals. They are non-transferrable, but can be *irreversibly* redeemed at any time to collect a proportional share of all ETH held by the Guild in the Guild Bank.

James operates through the submission, voting on, and processing of a series of membership proposals. To combat spam, new membership proposals can only be submitted by existing members and require a 10 ETH deposit. Applicants who wish to join must find a Guild member to champion their proposal and have that member call `submitProposal` on their behalf. The membership proposal includes the number of shares the applicant is requesting, and either the amount of ETH the applicant is offering as tribute or a pledge that the applicant will complete some work that benefits the Guild.

All ETH offered as tribute is held in escrow by the `James.sol` contract until the proposal vote is completed and processed. If a proposal vote passes, the applicant becomes a member, the shares requested are minted and assigned to them, and their tribute ETH is deposited into the `GuildBank.sol` contract. If a proposal vote is rejected, all tribute ETH is returned to the applicant. In either case, the 10 ETH deposit is returned to the member who submitted the proposal.

Proposals are voted on in the order they are submitted. The *voting period* for each proposal is 7 days. During the voting period, members can vote (only once, no redos) on a proposal by calling `submitVote`. There can be 5 proposals per day, so there can be a maximum of 35 proposals being voted on at any time (staggered by 4.8 hours). Proposal votes are determined by simple majority of votes cast on the proposal, with no quorum requirement.

At the end of the voting period, proposals enter into a 7 day *grace period* before the proposal is processed. The grace period gives members who voted **No** or didn't vote the opportunity to exit by calling the `ragequit` function and witdrawing their proportional share of ETH from the Guild Bank. Members who voted **Yes** must remain until the grace period expires and the proposal is processed, but only if the proposal passed. If the proposal failed, members who voted **Yes** can `ragequit` as well.

At the end of the grace period, proposals are processed when anyone calls `processProposal`. A 0.1 ETH reward is deducted from the proposal deposit and sent to the account to the address which calls `processProposal`.

#### Game Theory

By allowing Guild members to ragequit and exit at any time, James protects its members from 51% attacks and from supporting proposals they vehemently oppose.

In the worst case, one or more Guild members who control >50% of the shares could submit a proposal to grant themselves a ridiculous number of new shares, thereby diluting all other members of their claims to the Guild Bank assets and effectively stealing from them. If this were to happen, everyone else would ragequit during the grace period and take their share of the Guild Bank assets with them, and the proposal would have no impact.

In the more likely case of a contentious vote, those who oppose strongly enough can leave and increase the funding burden on those who choose to stay. Let's say the Guild has 100 outstanding shares and $100M worth of ETH in the Guild Bank. If a project proposal requests 1 newly minted share (~$1M worth), the vote is split 50/50 with 100% voter turnout, and the 50 who voted **No** all ragequit and take their $50M with them, then the remaining members would be diluting themselves twice as much: 1/51 = ~2% vs. 1/101 = ~1%.

In this fashion, the ragequit mechanism also provides an interesting incentive in favor of Guild cohesion. Guild members are disincentivized from voting **Yes** on proposals that they believe will make other members ragequit. Those who do vote **Yes** on contentious proposals will be forced to additionally dilute themselves proportional to the fraction of Voting Shares that ragequit in response.

## Installation

To intall this project run `npm install`.

## Testing

To tests the contracts run `npm run test`.

To compute their code coverage run `npm run coverage`.

## Deploying an interacting with a James DAO and a Pool

This project includes Buidler tasks for deploying and using DAOs and Pools.

### Deployment


#### Deploying a new DAO

Follow this instructions to deploy a new DAO:

1. Edit `buidler.config.js`, setting the values for `INFURA_API_KEY` and `MAINNET_PRIVATE_KEY`.
2. Edit `deployment-params.js`, setting your desired deployment parameters.
3. Run `npx buidler james-deploy --network mainnet`
4. Edit `buidler.config.js`, setting the address of the DAO in `networks.mainnet.deployedContracts.james`.

#### Deploying a new Pool

Follow this instructions to deploy a new Pool:

1. Edit `buidler.config.js`, setting the values for `INFURA_API_KEY` and `MAINNET_PRIVATE_KEY`.
2. Make sure you have the right address in `buidler.config.js`'s `networks.mainnet.deployedContracts.james` field.
3. Run `npx buidler pool-deploy --network mainnet --shares <shares> --tokens <tokens>` with the initial amount of tokens you want to donate to the pool, and how many shares you want in return.

### Interacting with the smart contracts

This project has tasks to work with DAOs and Pools. To use them, you should first follow this instructions:

1. Edit `buidler.config.js`, setting the values for `INFURA_API_KEY` and `MAINNET_PRIVATE_KEY`.
2. Make sure you have the right address in `buidler.config.js`'s `networks.mainnet.deployedContracts.james` field.
3. If you want to use a Pool, make sure you have the right address in `buidler.config.js`'s `networks.mainnet.deployedContracts.pool` field.

After following those instructions, you can run `npx buidler` to get a list with all the tasks:

```
$ npx buidler
AVAILABLE TASKS:

  clean                         Clears the cache and deletes all artifacts
  compile                       Compiles the entire project, building all artifacts
  console                       Opens a buidler console
  flatten                       Flattens and prints all contracts and their dependencies
  help                          Prints this message
  james-deploy                 Deploys a new instance of the James DAO
  james-process-proposal       Processes a proposal
  james-ragequit               Ragequits, burning some shares and getting tokens back
  james-submit-proposal        Submits a proposal
  james-submit-vote            Submits a vote
  james-update-delegate        Updates your delegate
  pool-add-keeper               Adds a keeper
  pool-deploy                   Deploys a new instance of the pool and activates it
  pool-deposit                  Donates tokens to the pool
  pool-keeper-withdraw          Withdraw other users' tokens from the pool
  pool-remove-keeper            Removes a keeper
  pool-sync                     Syncs the pool
  pool-withdraw                 Withdraw tokens from the pool
  run                           Runs a user-defined script after compiling the project
  test                          Runs mocha tests
```


You can run `npx buidler help <task>` to get help about each tasks and their parameters. For example:

```
$ npx buidler help james-submit-proposal
Buidler version 1.0.0-beta.7

Usage: buidler [GLOBAL OPTIONS] james-submit-proposal --applicant <STRING> --details <STRING> --shares <STRING> --tribute <STRING>

OPTIONS:

  --applicant   The address of the applicant
  --details     The proposal's details
  --shares      The number of shares requested
  --tribute     The number of token's wei offered as tribute

james-submit-proposal: Submits a proposal

For global options help run: buidler help
```

# James.sol

SECURITY NOTE: CALLING `APPROVE` ON THE MOLOCH CONTRACT IS NOT SAFE. ONLY `APPROVE` THE
AMOUNT OF WETH YOU INTEND TO SEND AS TRIBUTE, AND CONFIRM FOR YOURSELF THAT YOUR
APPLICATION PROPOSAL HAS THE CORRECT NUMBER OF SHARES REQUESTED. IF IT DOES
NOT, IT IS YOUR RESPONSIBILITY TO ABORT THE PROPOSAL IMMEDIATELY.

For more information about this, please see the documentation for the `abort`
function below.

## Data Structures

#### Global Constants
```
    uint256 public periodDuration; // default = 17280 = 4.8 hours in seconds (5 periods per day)
    uint256 public votingPeriodLength; // default = 35 periods (7 days)
    uint256 public gracePeriodLength; // default = 35 periods (7 days)
    uint256 public abortWindow; // default = 5 periods (1 day)
    uint256 public proposalDeposit; // default = 10 ETH (~$1,000 worth of ETH at contract deployment)
    uint256 public dilutionBound; // default = 3 - maximum multiplier a YES voter will be obligated to pay in case of mass ragequit
    uint256 public processingReward; // default = 0.1 - amount of ETH to give to whoever processes a proposal
    uint256 public summoningTime; // needed to determine the current period

    IERC20 public approvedToken; // approved token contract reference; default = wETH
    GuildBank public guildBank; // guild bank contract reference

    // HARD-CODED LIMITS
    // These numbers are quite arbitrary; they are small enough to avoid overflows when doing calculations
    // with periods or shares, yet big enough to not limit reasonable use cases.
    uint256 constant MAX_VOTING_PERIOD_LENGTH = 10**18; // maximum length of voting period
    uint256 constant MAX_GRACE_PERIOD_LENGTH = 10**18; // maximum length of grace period
    uint256 constant MAX_DILUTION_BOUND = 10**18; // maximum dilution bound
    uint256 constant MAX_NUMBER_OF_SHARES = 10**18; // maximum number of shares that can be minted
```

All deposits and tributes use the singular `approvedToken` set at contract deployment. In our case this will be wETH, and so we use wETH and ETH interchangably in this documentation.

#### Internal Accounting
```
    uint256 public totalShares = 0; // total shares across all members
    uint256 public totalSharesRequested = 0; // total shares that have been requested in unprocessed proposals
```

##### Proposals
The `Proposal` struct stores all relevant data for each proposal, and is saved in the `proposalQueue` array in the order it was submitted.
```
    struct Proposal {
        address proposer; // the member who submitted the proposal
        address applicant; // the applicant who wishes to become a member - this key will be used for withdrawals
        uint256 sharesRequested; // the # of shares the applicant is requesting
        uint256 startingPeriod; // the period in which voting can start for this proposal
        uint256 yesVotes; // the total number of YES votes for this proposal
        uint256 noVotes; // the total number of NO votes for this proposal
        bool processed; // true only if the proposal has been processed
        bool didPass; // true only if the proposal passed
        bool aborted; // true only if applicant calls "abort" fn before end of voting period
        uint256 tokenTribute; // amount of tokens offered as tribute
        string details; // proposal details - could be IPFS hash, plaintext, or JSON
        uint256 maxTotalSharesAtYesVote; // the maximum # of total shares encountered at a yes vote on this proposal
        mapping (address => Vote) votesByMember; // the votes on this proposal by each member
    }

    Proposal[] public proposalQueue;
```

##### Members
The `Member` struct stores all relevant data for each member, and is saved in the `members` mapping by the member's address.

```
    struct Member {
        address delegateKey; // the key responsible for submitting proposals and voting - defaults to member address unless updated
        uint256 shares; // the # of shares assigned to this member
        bool exists; // always true once a member has been created
        uint256 highestIndexYesVote; // highest proposal index # on which the member voted YES
    }

    mapping (address => Member) public members;
    mapping (address => address) public memberAddressByDelegateKey;
```

The `exists` field is set to `true` when a member is accepted and remains `true` even if a member redeems 100% of their shares. It is used to prevent overwriting existing members (who may have ragequit all their shares).

For additional security, members can optionally change their `delegateKey` (used for submitting and voting on proposals) to a different address by calling `updateDelegateKey`. The `memberAddressByDelegateKey` stores the member's address by the `delegateKey` address.

##### Votes
The Vote enum reflects the possible values of a proposal vote by a member.
```
    enum Vote {
        Null, // default value, counted as abstention
        Yes,
        No
    }
```

## Modifiers

#### onlyMember
Checks that the `msg.sender` is the address of a member with at least 1 share.
```
    modifier onlyMember {
        require(members[msg.sender].shares > 0, "James::onlyMember - not a member");
        _;
    }
```
Applied only to `ragequit` and `updateDelegateKey`.

#### onlyMemberDelegate
Checks that the `msg.sender` is the `delegateKey` of a member with at least 1 share.
```
    modifier onlyDelegate {
        require(members[memberAddressByDelegateKey[msg.sender]].shares > 0, "James::onlyDelegate - not a delegate");
        _;
    }
```

Applied only to `submitProposal` and `submitVote`.

## Functions

### James Constructor
1. Sets the `approvedToken` ERC20 contract reference.
2. Deploys a new `GuildBank.sol` contract and saves the reference.
3. Saves passed in values for global constants `periodDuration`, `votingPeriodLength`, `gracePeriodLength`, `abortWindow`, `proposalDeposit`, `dilutionBound`,  and `processingReward`.
4. Saves the start time of James `summoningTime = now`.
5. Mints 1 share for the `summoner` and saves their membership.

```
    constructor(
        address summoner,
        address _approvedToken,
        uint256 _periodDuration,
        uint256 _votingPeriodLength,
        uint256 _gracePeriodLength,
        uint256 _abortWindow,
        uint256 _proposalDeposit,
        uint256 _dilutionBound,
        uint256 _processingReward
    ) public {
        require(summoner != address(0), "James::constructor - summoner cannot be 0");
        require(_approvedToken != address(0), "James::constructor - _approvedToken cannot be 0");
        require(_periodDuration > 0, "James::constructor - _periodDuration cannot be 0");
        require(_votingPeriodLength > 0, "James::constructor - _votingPeriodLength cannot be 0");
        require(_votingPeriodLength <= MAX_VOTING_PERIOD_LENGTH, "James::constructor - _votingPeriodLength exceeds limit");
        require(_gracePeriodLength <= MAX_GRACE_PERIOD_LENGTH, "James::constructor - _gracePeriodLength exceeds limit");
        require(_abortWindow > 0, "James::constructor - _abortWindow cannot be 0");
        require(_abortWindow <= _votingPeriodLength, "James::constructor - _abortWindow must be smaller than _votingPeriodLength");
        require(_dilutionBound > 0, "James::constructor - _dilutionBound cannot be 0");
        require(_dilutionBound <= MAX_DILUTION_BOUND, "James::constructor - _dilutionBound exceeds limit");
        require(_proposalDeposit >= _processingReward, "James::constructor - _proposalDeposit cannot be smaller than _processingReward");

        approvedToken = IERC20(_approvedToken);

        guildBank = new GuildBank(_approvedToken);

        periodDuration = _periodDuration;
        votingPeriodLength = _votingPeriodLength;
        gracePeriodLength = _gracePeriodLength;
        abortWindow = _abortWindow;
        proposalDeposit = _proposalDeposit;
        dilutionBound = _dilutionBound;
        processingReward = _processingReward;

        summoningTime = now;

        members[summoner] = Member(summoner, 1, true, 0);
        memberAddressByDelegateKey[summoner] = summoner;
        totalShares = 1;

        emit SummonComplete(summoner, 1);
    }

```

### submitProposal
At any time, members can submit new proposals using their `delegateKey`.
1. Updates `totalSharesRequested` with the shares requested by the proposal.
2. Transfers the proposal deposit and tribute ETH to the `James.sol` contract to be held in escrow until the proposal vote is completed and processed.
4. Calculates the proposal starting period, creates a new proposal, and pushes the proposal to the end of the `proposalQueue`.

```
    function submitProposal(
        address applicant,
        uint256 tokenTribute,
        uint256 sharesRequested,
        string memory details
    )
        public
        onlyDelegate
    {
        require(applicant != address(0), "James::submitProposal - applicant cannot be 0");

        // Make sure we won't run into overflows when doing calculations with shares.
        // Note that totalShares + totalSharesRequested + sharesRequested is an upper bound
        // on the number of shares that can exist until this proposal has been processed.
        require(totalShares.add(totalSharesRequested).add(sharesRequested) <= MAX_NUMBER_OF_SHARES, "James::submitProposal - too many shares requested");

        totalSharesRequested = totalSharesRequested.add(sharesRequested);

        address memberAddress = memberAddressByDelegateKey[msg.sender];

        // collect proposal deposit from proposer and store it in the James until the proposal is processed
        require(approvedToken.transferFrom(msg.sender, address(this), proposalDeposit), "James::submitProposal - proposal deposit token transfer failed");

        // collect tribute from applicant and store it in the James until the proposal is processed
        require(approvedToken.transferFrom(applicant, address(this), tokenTribute), "James::submitProposal - tribute token transfer failed");

        // compute startingPeriod for proposal
        uint256 startingPeriod = max(
            getCurrentPeriod(),
            proposalQueue.length == 0 ? 0 : proposalQueue[proposalQueue.length.sub(1)].startingPeriod
        ).add(1);

        // create proposal ...
        Proposal memory proposal = Proposal({
            proposer: memberAddress,
            applicant: applicant,
            sharesRequested: sharesRequested,
            startingPeriod: startingPeriod,
            yesVotes: 0,
            noVotes: 0,
            processed: false,
            didPass: false,
            aborted: false,
            tokenTribute: tokenTribute,
            details: details,
            maxTotalSharesAtYesVote: 0
        });

        // ... and append it to the queue
        proposalQueue.push(proposal);

        uint256 proposalIndex = proposalQueue.length.sub(1);
        emit SubmitProposal(proposalIndex, msg.sender, memberAddress, applicant, tokenTribute, sharesRequested);
    }
```

If there are no proposals in the queue, or if all the proposals in the queue have already started their respective voting period, then the proposal `startingPeriod` will be set to the next period. If there are proposals in the queue that have not started their voting period yet, the `startingPeriod` for the submitted proposal will be the next period after the `startingPeriod` of the last proposal in the queue.

Existing members can earn additional voting shares through new proposals if they are listed as the `applicant`.

### submitVote
While a proposal is in its voting period, members can submit their vote using their `delegateKey`.
1. Saves the vote on the proposal by the member address.
2. Based on their vote, adds the member's voting shares to the proposal `yesVotes` or `noVotes` tallies.
4. If the member voted **Yes** and this is now the highest index proposal they voted **Yes** on, update their `highestIndexYesVote`.
5. If the member voted **Yes** and this is now the most total shares that the Guild had during any **Yes** vote, update the proposal `maxTotalSharesAtYesVote`.

```
    function submitVote(uint256 proposalIndex, uint8 uintVote) public onlyDelegate {
        address memberAddress = memberAddressByDelegateKey[msg.sender];
        Member storage member = members[memberAddress];

        require(proposalIndex < proposalQueue.length, "James::submitVote - proposal does not exist");
        Proposal storage proposal = proposalQueue[proposalIndex];

        require(uintVote < 3, "James::submitVote - uintVote must be less than 3");
        Vote vote = Vote(uintVote);

        require(getCurrentPeriod() >= proposal.startingPeriod, "James::submitVote - voting period has not started");
        require(!hasVotingPeriodExpired(proposal.startingPeriod), "James::submitVote - proposal voting period has expired");
        require(proposal.votesByMember[memberAddress] == Vote.Null, "James::submitVote - member has already voted on this proposal");
        require(vote == Vote.Yes || vote == Vote.No, "James::submitVote - vote must be either Yes or No");
        require(!proposal.aborted, "James::submitVote - proposal has been aborted");

        // store vote
        proposal.votesByMember[memberAddress] = vote;

        // count vote
        if (vote == Vote.Yes) {
            proposal.yesVotes = proposal.yesVotes.add(member.shares);

            // set highest index (latest) yes vote - must be processed for member to ragequit
            if (proposalIndex > member.highestIndexYesVote) {
                member.highestIndexYesVote = proposalIndex;
            }

            // set maximum of total shares encountered at a yes vote - used to bound dilution for yes voters
            if (totalShares > proposal.maxTotalSharesAtYesVote) {
                proposal.maxTotalSharesAtYesVote = totalShares;
            }

        } else if (vote == Vote.No) {
            proposal.noVotes = proposal.noVotes.add(member.shares);
        }

        emit SubmitVote(proposalIndex, msg.sender, memberAddress, uintVote);
```

### processProposal
After a proposal has completed its grace period, anyone can call `processProposal` to tally the votes and either accept or reject it. The caller receives 0.1 ETH as a reward.

1. Sets `proposal.processed = true` to prevent duplicate processing.
2. Update `totalSharesRequested` to deduct the proposal shares requested.
3. Determine if the proposal passed or failed based on the votes and whether or not the dilution bound was exceeded.
4. If the proposal passed (and was not aborted):
    4.1. If the applicant is an existing member, add the requested shares to their existing shares.
    4.2. If the applicant is a new member, save their data and set their default `delegateKey` to be the same as their member address.
        4.2.1. For new members, if the member address is taken by an existing member's `delegateKey` forcibly reset that member's `delegateKey` to their member address.
    4.3. Update the `totalShares`.
    4.4. Transfer the tribute ETH being held in escrow to the `GuildBank.sol` contract.
5. Otherwise (if the proposal failed or was aborted):
   5.1. Return all the tribute being held in escrow to the applicant.
6. Send the processing reward to the address that called this function.
7. Send the proposal deposit (minus the processing reward) back to the proposer.

```
    function processProposal(uint256 proposalIndex) public {
        require(proposalIndex < proposalQueue.length, "James::processProposal - proposal does not exist");
        Proposal storage proposal = proposalQueue[proposalIndex];

        require(getCurrentPeriod() >= proposal.startingPeriod.add(votingPeriodLength).add(gracePeriodLength), "James::processProposal - proposal is not ready to be processed");
        require(proposal.processed == false, "James::processProposal - proposal has already been processed");
        require(proposalIndex == 0 || proposalQueue[proposalIndex.sub(1)].processed, "James::processProposal - previous proposal must be processed");

        proposal.processed = true;
        totalSharesRequested = totalSharesRequested.sub(proposal.sharesRequested);

        bool didPass = proposal.yesVotes > proposal.noVotes;

        // Make the proposal fail if the dilutionBound is exceeded
        if (totalShares.mul(dilutionBound) < proposal.maxTotalSharesAtYesVote) {
            didPass = false;
        }

        // PROPOSAL PASSED
        if (didPass && !proposal.aborted) {

            proposal.didPass = true;

            // if the applicant is already a member, add to their existing shares
            if (members[proposal.applicant].exists) {
                members[proposal.applicant].shares = members[proposal.applicant].shares.add(proposal.sharesRequested);

            // the applicant is a new member, create a new record for them
            } else {
                // if the applicant address is already taken by a member's delegateKey, reset it to their member address
                if (members[memberAddressByDelegateKey[proposal.applicant]].exists) {
                    address memberToOverride = memberAddressByDelegateKey[proposal.applicant];
                    memberAddressByDelegateKey[memberToOverride] = memberToOverride;
                    members[memberToOverride].delegateKey = memberToOverride;
                }

                // use applicant address as delegateKey by default
                members[proposal.applicant] = Member(proposal.applicant, proposal.sharesRequested, true, 0);
                memberAddressByDelegateKey[proposal.applicant] = proposal.applicant;
            }

            // mint new shares
            totalShares = totalShares.add(proposal.sharesRequested);

            // transfer tokens to guild bank
            require(
                approvedToken.transfer(address(guildBank), proposal.tokenTribute),
                "James::processProposal - token transfer to guild bank failed"
            );

        // PROPOSAL FAILED OR ABORTED
        } else {
            // return all tokens to the applicant
            require(
                approvedToken.transfer(proposal.applicant, proposal.tokenTribute),
                "James::processProposal - failing vote token transfer failed"
            );
        }

        // send msg.sender the processingReward
        require(
            approvedToken.transfer(msg.sender, processingReward),
            "James::processProposal - failed to send processing reward to msg.sender"
        );

        // return deposit to proposer (subtract processing reward)
        require(
            approvedToken.transfer(proposal.proposer, proposalDeposit.sub(processingReward)),
            "James::processProposal - failed to return proposal deposit to proposer"
        );

        emit ProcessProposal(
            proposalIndex,
            proposal.applicant,
            proposal.proposer,
            proposal.tokenTribute,
            proposal.sharesRequested,
            didPass
        );
    }
```

The `dilutionBound` is a safety mechanism designed to prevent a member from facing a potentially unbounded grant obligation if they vote YES on a passing proposal and the vast majority of the other members ragequit before it is processed. The `proposal.maxTotalSharesAtYesVote` will be the highest total shares at the time of any **Yes** vote on the proposal. When the proposal is being processed, if members have ragequit and the total shares has dropped by more than the `dilutionBound` (default = 3), the proposal will fail. This means that members voting **Yes** will only be obligated to contribute *at most* 3x what the were willing to contribute their share of the proposal cost, if 2/3 of the shares ragequit.

### ragequit

At any time, so long as a member has not voted YES on any proposal in the voting period or grace period, they can *irreversibly* destroy some of their shares and receive a proportional sum of ETH from the Guild Bank.

1. Reduce the member's shares by the `sharesToBurn` being destroyed.
2. Reduce the total shares by the `sharesToBurn`.
3. Instruct the Guild Bank to send the member their proportional amount of ETH.

```
    function ragequit(uint256 sharesToBurn) public onlyMember {
        uint256 initialTotalShares = totalShares;

        Member storage member = members[msg.sender];

        require(member.shares >= sharesToBurn, "James::ragequit - insufficient shares");

        require(canRagequit(member.highestIndexYesVote), "James::ragequit - cant ragequit until highest index proposal member voted YES on is processed");

        // burn shares
        member.shares = member.shares.sub(sharesToBurn);
        totalShares = totalShares.sub(sharesToBurn);

        // instruct guildBank to transfer fair share of tokens to the ragequitter
        require(
            guildBank.withdraw(msg.sender, sharesToBurn, initialTotalShares),
            "James::ragequit - withdrawal of tokens from guildBank failed"
        );

        emit Ragequit(msg.sender, sharesToBurn);
    }
```

### abort

One vulnerability found during audit was that interacting with the James contract is that **calling "approve" with wETH is not safe**. When new applicants or existing members approve the transfer of some wETH to prepare for a proposal submission, any member could submit a proposal pointing to that applicant, `transferFrom` their approved tokens to James, but maliciously input fewer shares than the applicant was expecting, effectively stealing from them. If this were to happen the applicant would find themselves appealing to the good will of the Guild members to vote **No** on the proposal and return the applicant's funds.

To address this, a proposal applicant can call `abort` to cancel the proposal, disable all future votes, and immediately receive their money back. The applicant has from the time the proposal is submitted to the time the `abortWindow` expires (1 day into the voting period) to do this.

Aborting a proposal does **not** immediately return the proposer's deposit. They are punished by still having to wait until the proposal has been processed to get their deposit back.

1. Set the proposal `tokenTribute` to zero.
2. Set the proposal `aborted` to true.
3. Return all tribute tokens to the `applicant`.
```
    function abort(uint256 proposalIndex) public {
        require(proposalIndex < proposalQueue.length, "James::abort - proposal does not exist");
        Proposal storage proposal = proposalQueue[proposalIndex];

        require(msg.sender == proposal.applicant, "James::abort - msg.sender must be applicant");
        require(getCurrentPeriod() < proposal.startingPeriod.add(abortWindow), "James::abort - abort window must not have passed");
        require(!proposal.aborted, "James::abort - proposal must not have already been aborted");

        uint256 tokensToAbort = proposal.tokenTribute;
        proposal.tokenTribute = 0;
        proposal.aborted = true;

        // return all tokens to the applicant
        require(
            approvedToken.transfer(proposal.applicant, tokensToAbort),
            "James::processProposal - failing vote token transfer failed"
        );

        emit Abort(proposalIndex, msg.sender);
    }
```

Please check the audit report for the recommended fix. We agree that it makes sense, but in the interest of time we did not implement it. If any members are found abusing this vulnerability, we will prioritize deploying an upgraded James contract which fixes it, and migrating to that.

### updateDelegateKey

By default, when a member is accepted their `delegateKey` is set to their member
address. At any time, they can change it to be any address that isn't already in
use, or back to their member address.

1. Resets the old `delegateKey` reference in the `memberAddressByDelegateKey`
   mapping.
2. Sets the reference for the new `delegateKey` to the member in the
   `memberAddressByDelegateKey` mapping.
3. Updates the `member.delegateKey`.


```
    function updateDelegateKey(address newDelegateKey) public onlyMember {
        require(newDelegateKey != address(0), "James::updateDelegateKey - newDelegateKey cannot be 0");

        // skip checks if member is setting the delegate key to their member address
        if (newDelegateKey != msg.sender) {
            require(!members[newDelegateKey].exists, "James::updateDelegateKey - cant overwrite existing members");
            require(!members[memberAddressByDelegateKey[newDelegateKey]].exists, "James::updateDelegateKey - cant overwrite existing delegate keys");
        }

        Member storage member = members[msg.sender];
        memberAddressByDelegateKey[member.delegateKey] = address(0);
        memberAddressByDelegateKey[newDelegateKey] = msg.sender;
        member.delegateKey = newDelegateKey;

        emit UpdateDelegateKey(msg.sender, newDelegateKey);
    }
```

### Getters

#### max

Returns the maximum of two numbers.

```
    function max(uint256 x, uint256 y) internal pure returns (uint256) {
        return x >= y ? x : y;
    }
```

#### getCurrentPeriod

The difference between `now` and the `summoningTime` is used to figure out how many periods have elapsed and thus what the current period is.

```
    function getCurrentPeriod() public view returns (uint256) {
        return now.sub(summoningTime).div(periodDuration);
    }
```

#### getProposalQueueLength

Returns the length of the proposal queue.

```
    function getProposalQueueLength() public view returns (uint256) {
        return proposalQueue.length;
    }
```

#### canRagequit

Returns true if the `highestIndexYesVote` proposal has been processed.
```
    function canRagequit(uint256 highestIndexYesVote) public view returns (bool) {
        require(highestIndexYesVote < proposalQueue.length, "James::canRagequit - proposal does not exist");
        return proposalQueue[highestIndexYesVote].processed;
    }
```

Note: At James's inception, there will have been no proposals yet so the
`proposalQueue.length` will be 0. This means no one can ragequit until at least
one proposal has been processed. Fortunately, this only affects the summoner,
and because the Guild Bank will have no value until the first proposals have
passed anyways, it isn't a concern.

#### hasVotingPeriodExpired
```
    function hasVotingPeriodExpired(uint256 startingPeriod) public view returns (bool) {
        return getCurrentPeriod() >= startingPeriod.add(votingPeriodLength);
    }
```

#### getMemberProposalVote
```
    function getMemberProposalVote(address memberAddress, uint256 proposalIndex) public view returns (Vote) {
        require(members[memberAddress].exists, "James::getMemberProposalVote - member doesn't exist");
        require(proposalIndex < proposalQueue.length, "James::getMemberProposalVote - proposal doesn't exist");
        return proposalQueue[proposalIndex].votesByMember[memberAddress];
    }
```

# GuildBank.sol

## Data Structures

```
    ERC20 public approvedToken; // approved token contract reference
```

## Functions

### constructor
1. Sets the `approvedToken` and saves the contract reference. Called by the  `James.sol` constructor.
```
    constructor(address approvedTokenAddress) public {
        approvedToken = ERC20(approvedTokenAddress);
    }
```

### withdraw

Is called by the owner - the `James.sol` contract - in the `ragequit`
function.

1. Transfer a proportional share of ETH held by the guild bank to the
   provided `receiver` address.

```
    function withdraw(address receiver, uint256 shares, uint256 totalShares) public onlyOwner returns (bool) {
        uint256 amount = approvedToken.balanceOf(address(this)).mul(shares).div(totalShares);
        emit Withdrawal(receiver, amount);
        return approvedToken.transfer(receiver, amount);
    }
```
