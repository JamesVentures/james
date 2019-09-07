// TODO
// - events

const { artifacts, ethereum, web3 } = require('@nomiclabs/buidler')
const chai = require('chai')
const { assert } = chai
const safeUtils = require('./utilsPersonalSafe')
const utils = require('./utils')

const BN = web3.utils.BN

chai
  .use(require('chai-as-promised'))
  .should()

const James = artifacts.require('./James')
const GuildBank = artifacts.require('./GuildBank')
const Token = artifacts.require('./Token')
const ProxyFactory = artifacts.require('./ProxyFactory')
const GnosisSafe = artifacts.require('./GnosisSafe')

const deploymentConfig = {
  'SUMMONER': '0x9a8d670c323e894dda9a045372a75d607a47cb9e',
  'PERIOD_DURATION_IN_SECONDS': 17280,
  'VOTING_DURATON_IN_PERIODS': 35,
  'GRACE_DURATON_IN_PERIODS': 35,
  'ABORT_WINDOW_IN_PERIODS': 5,
  'PROPOSAL_DEPOSIT': 10,
  'DILUTION_BOUND': 3,
  'PROCESSING_REWARD': 1,
  'TOKEN_SUPPLY': 10000
}

const SolRevert = 'VM Exception while processing transaction: revert'

const zeroAddress = '0x0000000000000000000000000000000000000000'
const notOwnedAddress = '0x0000000000000000000000000000000000000002'
const _1e18 = new BN('1000000000000000000') // 1e18

async function blockTime () {
  const block = await web3.eth.getBlock('latest')
  return block.timestamp
}

async function snapshot () {
  return ethereum.send('evm_snapshot', [])
}

async function restore (snapshotId) {
  return ethereum.send('evm_revert', [snapshotId])
}

async function forceMine () {
  return ethereum.send('evm_mine', [])
}

async function moveForwardPeriods (periods) {
  await blockTime()
  const goToTime = deploymentConfig.PERIOD_DURATION_IN_SECONDS * periods
  await ethereum.send('evm_increaseTime', [goToTime])
  await forceMine()
  await blockTime()
  return true
}

let james, guildBank, token, proxyFactory, gnosisSafeMasterCopy, gnosisSafe
let proposal1, proposal2

// used by gnosis safe
const CALL = 0

const initSummonerBalance = 100

contract('James', ([creator, summoner, applicant1, applicant2, processor, delegateKey, ...otherAccounts]) => {
  let snapshotId

  // VERIFY SUBMIT PROPOSAL
  const verifySubmitProposal = async (
    proposal,
    proposalIndex,
    proposer,
    options
  ) => {
    const initialTotalSharesRequested = options.initialTotalSharesRequested
      ? options.initialTotalSharesRequested
      : 0
    const initialTotalShares = options.initialTotalShares
      ? options.initialTotalShares
      : 0
    const initialProposalLength = options.initialProposalLength
      ? options.initialProposalLength
      : 0
    const initialJamesBalance = options.initialJamesBalance
      ? options.initialJamesBalance
      : 0
    const initialApplicantBalance = options.initialApplicantBalance
      ? options.initialApplicantBalance
      : 0
    const initialProposerBalance = options.initialProposerBalance
      ? options.initialProposerBalance
      : 0

    const expectedStartingPeriod = options.expectedStartingPeriod
      ? options.expectedStartingPeriod
      : 1

    const proposalData = await james.proposalQueue.call(proposalIndex)
    assert.equal(proposalData.proposer, proposer)
    assert.equal(proposalData.applicant, proposal.applicant)
    if (typeof proposal.bondsRequested === 'number') {
      assert.equal(proposalData.bondsRequested, proposal.bondsRequested)
    } else {
      // for testing overflow boundary with BNs
      assert(proposalData.bondsRequested.eq(proposal.bondsRequested))
    }
    assert.equal(proposalData.startingPeriod, expectedStartingPeriod)
    assert.equal(proposalData.yesVotes, 0)
    assert.equal(proposalData.noVotes, 0)
    assert.equal(proposalData.processed, false)
    assert.equal(proposalData.didPass, false)
    assert.equal(proposalData.aborted, false)
    assert.equal(proposalData.tokenTribute, proposal.tokenTribute)
    assert.equal(proposalData.details, proposal.details)
    assert.equal(proposalData.maxTotalSharesAtYesVote, 0)

    const totalSharesRequested = await james.totalSharesRequested()
    if (typeof proposal.bondsRequested === 'number') {
      assert.equal(
        totalSharesRequested,
        proposal.bondsRequested + initialTotalSharesRequested
      )
    } else {
      // for testing overflow boundary with BNs
      assert(
        totalSharesRequested.eq(
          proposal.bondsRequested.add(new BN(initialTotalSharesRequested))
        )
      )
    }

    const totalShares = await james.totalShares()
    assert.equal(totalShares, initialTotalShares)

    const proposalQueueLength = await james.getProposalQueueLength()
    assert.equal(proposalQueueLength, initialProposalLength + 1)

    const jamesBalance = await token.balanceOf(james.address)
    assert.equal(
      jamesBalance,
      initialJamesBalance + proposal.tokenTribute + deploymentConfig.PROPOSAL_DEPOSIT
    )

    const applicantBalance = await token.balanceOf(proposal.applicant)
    assert.equal(
      applicantBalance,
      initialApplicantBalance - proposal.tokenTribute
    )

    const proposerBalance = await token.balanceOf(proposer)
    assert.equal(
      proposerBalance,
      initialProposerBalance - deploymentConfig.PROPOSAL_DEPOSIT
    )
  }

  // VERIFY SUBMIT VOTE
  const verifySubmitVote = async (
    proposal,
    proposalIndex,
    memberAddress,
    expectedVote,
    options
  ) => {
    const initialYesVotes = options.initialYesVotes
      ? options.initialYesVotes
      : 0
    const initialNoVotes = options.initialNoVotes ? options.initialNoVotes : 0
    const expectedMaxSharesAtYesVote = options.expectedMaxSharesAtYesVote
      ? options.expectedMaxSharesAtYesVote
      : 0

    const proposalData = await james.proposalQueue.call(proposalIndex)
    assert.equal(
      proposalData.yesVotes,
      initialYesVotes + (expectedVote === 1 ? 1 : 0)
    )
    assert.equal(
      proposalData.noVotes,
      initialNoVotes + (expectedVote === 1 ? 0 : 1)
    )
    assert.equal(
      proposalData.maxTotalSharesAtYesVote,
      expectedMaxSharesAtYesVote
    )

    const memberVote = await james.getMemberProposalVote(
      memberAddress,
      proposalIndex
    )
    assert.equal(memberVote, expectedVote)
  }

  // VERIFY PROCESS PROPOSAL - note: doesnt check forced reset of delegate key
  const verifyProcessProposal = async (
    proposal,
    proposalIndex,
    proposer,
    processor,
    options
  ) => {
    // eslint-disable-next-line no-unused-vars
    const initialTotalSharesRequested = options.initialTotalSharesRequested
      ? options.initialTotalSharesRequested
      : 0
    const initialTotalShares = options.initialTotalShares
      ? options.initialTotalShares
      : 0
    const initialApplicantShares = options.initialApplicantShares
      ? options.initialApplicantShares
      : 0 // 0 means new member, > 0 means existing member
    const initialJamesBalance = options.initialJamesBalance
      ? options.initialJamesBalance
      : 0
    const initialGuildBankBalance = options.initialGuildBankBalance
      ? options.initialGuildBankBalance
      : 0
    const initialApplicantBalance = options.initialApplicantBalance
      ? options.initialApplicantBalance
      : 0
    const initialProposerBalance = options.initialProposerBalance
      ? options.initialProposerBalance
      : 0
    const initialProcessorBalance = options.initialProcessorBalance
      ? options.initialProcessorBalance
      : 0
    const expectedYesVotes = options.expectedYesVotes
      ? options.expectedYesVotes
      : 0
    const expectedNoVotes = options.expectedNoVotes
      ? options.expectedNoVotes
      : 0
    const expectedMaxSharesAtYesVote = options.expectedMaxSharesAtYesVote
      ? options.expectedMaxSharesAtYesVote
      : 0
    const expectedFinalTotalSharesRequested = options.expectedFinalTotalSharesRequested
      ? options.expectedFinalTotalSharesRequested
      : 0
    const didPass =
      typeof options.didPass === 'boolean' ? options.didPass : true
    const aborted =
      typeof options.aborted === 'boolean' ? options.aborted : false

    const proposalData = await james.proposalQueue.call(proposalIndex)
    assert.equal(proposalData.yesVotes, expectedYesVotes)
    assert.equal(proposalData.noVotes, expectedNoVotes)
    assert.equal(
      proposalData.maxTotalSharesAtYesVote,
      expectedMaxSharesAtYesVote
    )
    assert.equal(proposalData.processed, true)
    assert.equal(proposalData.didPass, didPass)
    assert.equal(proposalData.aborted, aborted)

    const totalSharesRequested = await james.totalSharesRequested()
    assert.equal(totalSharesRequested, expectedFinalTotalSharesRequested)

    const totalShares = await james.totalShares()
    assert.equal(
      totalShares,
      didPass && !aborted
        ? initialTotalShares + proposal.bondsRequested
        : initialTotalShares
    )

    const jamesBalance = await token.balanceOf(james.address)
    assert.equal(
      jamesBalance,
      initialJamesBalance - proposal.tokenTribute - deploymentConfig.PROPOSAL_DEPOSIT
    )

    const guildBankBalance = await token.balanceOf(guildBank.address)
    assert.equal(
      guildBankBalance,
      didPass && !aborted
        ? initialGuildBankBalance + proposal.tokenTribute
        : initialGuildBankBalance
    )

    // proposer and applicant are different
    if (proposer !== proposal.applicant) {
      const applicantBalance = await token.balanceOf(proposal.applicant)
      assert.equal(
        applicantBalance,
        didPass && !aborted
          ? initialApplicantBalance
          : initialApplicantBalance + proposal.tokenTribute
      )

      const proposerBalance = await token.balanceOf(proposer)
      assert.equal(
        proposerBalance,
        initialProposerBalance +
          deploymentConfig.PROPOSAL_DEPOSIT -
          deploymentConfig.PROCESSING_REWARD
      )

      // proposer is applicant
    } else {
      const proposerBalance = await token.balanceOf(proposer)
      const expectedBalance =
        didPass && !aborted
          ? initialProposerBalance +
            deploymentConfig.PROPOSAL_DEPOSIT -
            deploymentConfig.PROCESSING_REWARD
          : initialProposerBalance +
            deploymentConfig.PROPOSAL_DEPOSIT -
            deploymentConfig.PROCESSING_REWARD +
            proposal.tokenTribute
      assert.equal(proposerBalance, expectedBalance)
    }

    const processorBalance = await token.balanceOf(processor)
    assert.equal(
      processorBalance,
      initialProcessorBalance + deploymentConfig.PROCESSING_REWARD
    )

    if (didPass && !aborted) {
      // existing member
      if (initialApplicantShares > 0) {
        const memberData = await james.members(proposal.applicant)
        assert.equal(
          memberData.bonds,
          proposal.bondsRequested + initialApplicantShares
        )

        // new member
      } else {
        const newMemberData = await james.members(proposal.applicant)
        assert.equal(newMemberData.delegateKey, proposal.applicant)
        assert.equal(newMemberData.bonds, proposal.bondsRequested)
        assert.equal(newMemberData.exists, true)
        assert.equal(newMemberData.highestIndexYesVote, 0)

        const newMemberAddressByDelegateKey = await james.memberAddressByDelegateKey(
          proposal.applicant
        )
        assert.equal(newMemberAddressByDelegateKey, proposal.applicant)
      }
    }
  }

  // VERIFY UPDATE DELEGATE KEY
  const verifyUpdateDelegateKey = async (
    memberAddress,
    oldDelegateKey,
    newDelegateKey
  ) => {
    const member = await james.members(memberAddress)
    assert.equal(member.delegateKey, newDelegateKey)
    const memberByOldDelegateKey = await james.memberAddressByDelegateKey(
      oldDelegateKey
    )
    assert.equal(memberByOldDelegateKey, zeroAddress)
    const memberByNewDelegateKey = await james.memberAddressByDelegateKey(
      newDelegateKey
    )
    assert.equal(memberByNewDelegateKey, memberAddress)
  }

  before('deploy contracts', async () => {
    token = await Token.new(deploymentConfig.TOKEN_SUPPLY)
    james = await James.new(
      deploymentConfig.SUMMONER,
      token.address,
      deploymentConfig.PERIOD_DURATION_IN_SECONDS,
      deploymentConfig.VOTING_DURATON_IN_PERIODS,
      deploymentConfig.GRACE_DURATON_IN_PERIODS,
      deploymentConfig.ABORT_WINDOW_IN_PERIODS,
      deploymentConfig.PROPOSAL_DEPOSIT,
      deploymentConfig.DILUTION_BOUND,
      deploymentConfig.PROCESSING_REWARD
    )

    const guildBankAddress = await james.guildBank()
    guildBank = await GuildBank.at(guildBankAddress)

    proxyFactory = await ProxyFactory.new()
    gnosisSafeMasterCopy = await GnosisSafe.new()

    await gnosisSafeMasterCopy.setup([notOwnedAddress], 1, zeroAddress, '0x', zeroAddress, 0, zeroAddress)
  })

  beforeEach(async () => {
    snapshotId = await snapshot()

    proposal1 = {
      applicant: applicant1,
      tokenTribute: 100,
      bondsRequested: 1,
      details: 'all hail james'
    }

    token.transfer(summoner, initSummonerBalance, { from: creator })
  })

  afterEach(async () => {
    await restore(snapshotId)
  })

  it('verify deployment parameters', async () => {
    // eslint-disable-next-line no-unused-vars
    const now = await blockTime()

    const approvedTokenAddress = await james.approvedToken()
    assert.equal(approvedTokenAddress, token.address)

    const guildBankAddress = await james.guildBank()
    assert.equal(guildBankAddress, guildBank.address)

    const guildBankOwner = await guildBank.owner()
    assert.equal(guildBankOwner, james.address)

    const guildBankToken = await guildBank.approvedToken()
    assert.equal(guildBankToken, token.address)

    const periodDuration = await james.periodDuration()
    assert.equal(+periodDuration, deploymentConfig.PERIOD_DURATION_IN_SECONDS)

    const votingPeriodLength = await james.votingPeriodLength()
    assert.equal(+votingPeriodLength, deploymentConfig.VOTING_DURATON_IN_PERIODS)

    const gracePeriodLength = await james.gracePeriodLength()
    assert.equal(+gracePeriodLength, deploymentConfig.GRACE_DURATON_IN_PERIODS)

    const abortWindow = await james.abortWindow()
    assert.equal(+abortWindow, deploymentConfig.ABORT_WINDOW_IN_PERIODS)

    const proposalDeposit = await james.proposalDeposit()
    assert.equal(+proposalDeposit, deploymentConfig.PROPOSAL_DEPOSIT)

    const dilutionBound = await james.dilutionBound()
    assert.equal(+dilutionBound, deploymentConfig.DILUTION_BOUND)

    const processingReward = await james.processingReward()
    assert.equal(+processingReward, deploymentConfig.PROCESSING_REWARD)

    const currentPeriod = await james.getCurrentPeriod()
    assert.equal(+currentPeriod, 0)

    const summonerData = await james.members(deploymentConfig.SUMMONER)
    assert.equal(summonerData.delegateKey.toLowerCase(), deploymentConfig.SUMMONER) // delegateKey matches
    assert.equal(summonerData.bonds, 1)
    assert.equal(summonerData.exists, true)
    assert.equal(summonerData.highestIndexYesVote, 0)

    const summonerAddressByDelegateKey = await james.memberAddressByDelegateKey(
      deploymentConfig.SUMMONER
    )
    assert.equal(summonerAddressByDelegateKey.toLowerCase(), deploymentConfig.SUMMONER)

    const totalShares = await james.totalShares()
    assert.equal(+totalShares, 1)

    // confirm initial token supply and summoner balance
    const tokenSupply = await token.totalSupply()
    assert.equal(+tokenSupply.toString(), deploymentConfig.TOKEN_SUPPLY)
    const summonerBalance = await token.balanceOf(summoner)
    assert.equal(+summonerBalance.toString(), initSummonerBalance)
    const creatorBalance = await token.balanceOf(creator)
    assert.equal(creatorBalance, deploymentConfig.TOKEN_SUPPLY - initSummonerBalance)
  })

  describe('submitProposal', () => {
    beforeEach(async () => {
      await token.transfer(proposal1.applicant, proposal1.tokenTribute, {
        from: creator
      })
      await token.approve(james.address, 10, { from: summoner })
      await token.approve(james.address, proposal1.tokenTribute, {
        from: proposal1.applicant
      })
    })

    it('happy case', async () => {
      await james.submitProposal(
        proposal1.applicant,
        proposal1.tokenTribute,
        proposal1.bondsRequested,
        proposal1.details,
        { from: summoner }
      )
      await verifySubmitProposal(proposal1, 0, summoner, {
        initialTotalShares: 1,
        initialApplicantBalance: proposal1.tokenTribute,
        initialProposerBalance: initSummonerBalance
      })
    })

    describe('uint overflow boundary', () => {
      it('require fail - uint overflow', async () => {
        proposal1.bondsRequested = _1e18
        await james
          .submitProposal(
            proposal1.applicant,
            proposal1.tokenTribute,
            proposal1.bondsRequested,
            proposal1.details,
            { from: summoner }
          )
          .should.be.rejectedWith('too many bonds requested')
      })

      it('success - request 1 less share than the overflow limit', async () => {
        proposal1.bondsRequested = _1e18.sub(new BN(1)) // 1 less
        await james.submitProposal(
          proposal1.applicant,
          proposal1.tokenTribute,
          proposal1.bondsRequested,
          proposal1.details,
          { from: summoner }
        )
        await verifySubmitProposal(proposal1, 0, summoner, {
          initialTotalShares: 1,
          initialApplicantBalance: proposal1.tokenTribute,
          initialProposerBalance: initSummonerBalance
        })
      })
    })

    it('require fail - insufficient proposal deposit', async () => {
      await token.decreaseAllowance(james.address, 1, { from: summoner })

      // SafeMath reverts in ERC20.transferFrom
      await james
        .submitProposal(
          proposal1.applicant,
          proposal1.tokenTribute,
          proposal1.bondsRequested,
          proposal1.details
        )
        .should.be.rejectedWith(SolRevert)
    })

    it('require fail - insufficient applicant tokens', async () => {
      await token.decreaseAllowance(james.address, 1, {
        from: proposal1.applicant
      })

      // SafeMath reverts in ERC20.transferFrom
      await james
        .submitProposal(
          proposal1.applicant,
          proposal1.tokenTribute,
          proposal1.bondsRequested,
          proposal1.details
        )
        .should.be.rejectedWith(SolRevert)
    })

    it('modifier - delegate', async () => {
      await james
        .submitProposal(
          proposal1.applicant,
          proposal1.tokenTribute,
          proposal1.bondsRequested,
          proposal1.details,
          { from: creator }
        )
        .should.be.rejectedWith('not a delegate')
    })

    it('edge case - proposal tribute is 0', async () => {
      const unspentTribute = proposal1.tokenTribute
      proposal1.tokenTribute = 0
      await james.submitProposal(
        proposal1.applicant,
        proposal1.tokenTribute,
        proposal1.bondsRequested,
        proposal1.details,
        { from: summoner }
      )
      await verifySubmitProposal(proposal1, 0, summoner, {
        initialTotalShares: 1,
        initialApplicantBalance: unspentTribute, // should still have all tribute funds
        initialProposerBalance: initSummonerBalance
      })
    })

    it('edge case - bonds requested is 0', async () => {
      proposal1.bondsRequested = 0
      await james.submitProposal(
        proposal1.applicant,
        proposal1.tokenTribute,
        proposal1.bondsRequested,
        proposal1.details,
        { from: summoner }
      )
      await verifySubmitProposal(proposal1, 0, summoner, {
        initialTotalShares: 1,
        initialApplicantBalance: proposal1.tokenTribute,
        initialProposerBalance: initSummonerBalance
      })
    })
  })

  describe('submitVote', () => {
    beforeEach(async () => {
      await token.transfer(proposal1.applicant, proposal1.tokenTribute, {
        from: creator
      })
      await token.approve(james.address, 10, { from: summoner })
      await token.approve(james.address, proposal1.tokenTribute, {
        from: proposal1.applicant
      })

      await james.submitProposal(
        proposal1.applicant,
        proposal1.tokenTribute,
        proposal1.bondsRequested,
        proposal1.details,
        { from: summoner }
      )
    })

    it('happy case - yes vote', async () => {
      await moveForwardPeriods(1)
      await james.submitVote(0, 1, { from: summoner })
      await verifySubmitVote(proposal1, 0, summoner, 1, {
        expectedMaxSharesAtYesVote: 1
      })
    })

    it('happy case - no vote', async () => {
      await moveForwardPeriods(1)
      await james.submitVote(0, 2, { from: summoner })
      await verifySubmitVote(proposal1, 0, summoner, 2, {})
    })

    it('require fail - proposal does not exist', async () => {
      await moveForwardPeriods(1)
      await james
        .submitVote(1, 1, { from: summoner })
        .should.be.rejectedWith('proposal does not exist')
    })

    it('require fail - voting period has not started', async () => {
      // don't move the period forward
      await james
        .submitVote(0, 1, { from: summoner })
        .should.be.rejectedWith('voting period has not started')
    })

    describe('voting period boundary', () => {
      it('require fail - voting period has expired', async () => {
        await moveForwardPeriods(deploymentConfig.VOTING_DURATON_IN_PERIODS + 1)
        await james
          .submitVote(0, 1, { from: summoner })
          .should.be.rejectedWith('voting period has expired')
      })

      it('success - vote 1 period before voting period expires', async () => {
        await moveForwardPeriods(deploymentConfig.VOTING_DURATON_IN_PERIODS)
        await james.submitVote(0, 1, { from: summoner })
        await verifySubmitVote(proposal1, 0, summoner, 1, {
          expectedMaxSharesAtYesVote: 1
        })
      })
    })

    it('require fail - member has already voted', async () => {
      await moveForwardPeriods(1)
      await james.submitVote(0, 1, { from: summoner })
      await james
        .submitVote(0, 1, { from: summoner })
        .should.be.rejectedWith('member has already voted on this proposal')
    })

    it('require fail - vote must be yes or no', async () => {
      await moveForwardPeriods(1)
      // vote null
      await james
        .submitVote(0, 0, { from: summoner })
        .should.be.rejectedWith('vote must be either Yes or No')
      // vote out of bounds
      await james
        .submitVote(0, 3, { from: summoner })
        .should.be.rejectedWith('uintVote must be less than 3')
    })

    it('require fail - proposal has been aborted', async () => {
      await james.abort(0, { from: proposal1.applicant })
      await moveForwardPeriods(1)
      await james
        .submitVote(0, 1, { from: summoner })
        .should.be.rejectedWith('proposal has been aborted')
    })

    it('modifier - delegate', async () => {
      await moveForwardPeriods(1)
      await james
        .submitVote(0, 1, { from: creator })
        .should.be.rejectedWith('not a delegate')
    })
  })

  describe('processProposal', () => {
    beforeEach(async () => {
      await token.transfer(proposal1.applicant, proposal1.tokenTribute, {
        from: creator
      })
      await token.approve(james.address, 10, { from: summoner })
      await token.approve(james.address, proposal1.tokenTribute, {
        from: proposal1.applicant
      })

      await james.submitProposal(
        proposal1.applicant,
        proposal1.tokenTribute,
        proposal1.bondsRequested,
        proposal1.details,
        { from: summoner }
      )

      await moveForwardPeriods(1)
      await james.submitVote(0, 1, { from: summoner })

      await moveForwardPeriods(deploymentConfig.VOTING_DURATON_IN_PERIODS)
    })

    it('happy case', async () => {
      await moveForwardPeriods(deploymentConfig.GRACE_DURATON_IN_PERIODS)
      await james.processProposal(0, { from: processor })
      await verifyProcessProposal(proposal1, 0, summoner, processor, {
        initialTotalSharesRequested: 1,
        initialTotalShares: 1,
        initialJamesBalance: 110,
        initialProposerBalance: initSummonerBalance - deploymentConfig.PROPOSAL_DEPOSIT,
        expectedYesVotes: 1,
        expectedMaxSharesAtYesVote: 1
      })
    })

    it('require fail - proposal does not exist', async () => {
      await moveForwardPeriods(deploymentConfig.GRACE_DURATON_IN_PERIODS)
      await james
        .processProposal(1)
        .should.be.rejectedWith('proposal does not exist')
    })

    it('require fail - proposal is not ready to be processed', async () => {
      await moveForwardPeriods(deploymentConfig.GRACE_DURATON_IN_PERIODS - 1)
      await james
        .processProposal(0)
        .should.be.rejectedWith('proposal is not ready to be processed')
    })

    it('require fail - proposal has already been processed', async () => {
      await moveForwardPeriods(deploymentConfig.GRACE_DURATON_IN_PERIODS)
      await james.processProposal(0, { from: processor })
      await james
        .processProposal(0)
        .should.be.rejectedWith('proposal has already been processed')
    })
  })

  describe('processProposal - edge cases', () => {
    beforeEach(async () => {
      await token.transfer(proposal1.applicant, proposal1.tokenTribute, {
        from: creator
      })
      await token.approve(james.address, 10, { from: summoner })
      await token.approve(james.address, proposal1.tokenTribute, {
        from: proposal1.applicant
      })

      await james.submitProposal(
        proposal1.applicant,
        proposal1.tokenTribute,
        proposal1.bondsRequested,
        proposal1.details,
        { from: summoner }
      )
      await moveForwardPeriods(1)
    })

    it('proposal fails when no votes > yes votes', async () => {
      await james.submitVote(0, 2, { from: summoner })
      await moveForwardPeriods(deploymentConfig.VOTING_DURATON_IN_PERIODS)
      await moveForwardPeriods(deploymentConfig.GRACE_DURATON_IN_PERIODS)
      await james.processProposal(0, { from: processor })
      await verifyProcessProposal(proposal1, 0, summoner, processor, {
        initialTotalSharesRequested: 1,
        initialTotalShares: 1,
        initialJamesBalance: 110,
        initialProposerBalance: initSummonerBalance - deploymentConfig.PROPOSAL_DEPOSIT,
        expectedNoVotes: 1,
        expectedMaxSharesAtYesVote: 0,
        didPass: false // proposal should not pass
      })
    })

    it('force resets members delegate key if assigned to newly admitted applicant', async () => {
      await james.submitVote(0, 1, { from: summoner })

      const newDelegateKey = proposal1.applicant
      await james.updateDelegateKey(newDelegateKey, { from: summoner })

      await moveForwardPeriods(deploymentConfig.VOTING_DURATON_IN_PERIODS)
      await moveForwardPeriods(deploymentConfig.GRACE_DURATON_IN_PERIODS)
      await james.processProposal(0, { from: processor })
      await verifyProcessProposal(proposal1, 0, summoner, processor, {
        initialTotalSharesRequested: 1,
        initialTotalShares: 1,
        initialJamesBalance: 110,
        initialProposerBalance: initSummonerBalance - deploymentConfig.PROPOSAL_DEPOSIT,
        expectedYesVotes: 1,
        expectedMaxSharesAtYesVote: 1
      })

      // verify that the summoner delegate key has been reset
      const summonerData = await james.members(summoner)
      assert.equal(summonerData.delegateKey, summoner)

      const summonerAddressByDelegateKey = await james.memberAddressByDelegateKey(
        summoner
      )
      assert.equal(summonerAddressByDelegateKey, summoner)
    })
  })

  describe('processProposal - more edge cases', () => {
    beforeEach(async () => {
      proposal1.applicant = summoner

      await token.transfer(summoner, 10, { from: creator }) // summoner has 100 init, add 10 for deposit + tribute
      await token.approve(james.address, 110, { from: summoner }) // approve enough for deposit + tribute

      await james.submitProposal(
        proposal1.applicant,
        proposal1.tokenTribute,
        proposal1.bondsRequested,
        proposal1.details,
        { from: summoner }
      )
      await moveForwardPeriods(1)
    })

    it('when applicant is an existing member, adds to their bonds', async () => {
      await james.submitVote(0, 1, { from: summoner })

      await moveForwardPeriods(deploymentConfig.VOTING_DURATON_IN_PERIODS)
      await moveForwardPeriods(deploymentConfig.GRACE_DURATON_IN_PERIODS)
      await james.processProposal(0, { from: processor })
      await verifyProcessProposal(proposal1, 0, summoner, processor, {
        initialTotalSharesRequested: 1,
        initialTotalShares: 1,
        initialApplicantShares: 1, // existing member with 1 share
        initialJamesBalance: 110,
        expectedYesVotes: 1,
        expectedMaxSharesAtYesVote: 1
      })
    })
  })

  describe('processProposal + abort', () => {
    beforeEach(async () => {
      await token.transfer(proposal1.applicant, proposal1.tokenTribute, {
        from: creator
      })
      await token.approve(james.address, 10, { from: summoner })
      await token.approve(james.address, proposal1.tokenTribute, {
        from: proposal1.applicant
      })

      await james.submitProposal(
        proposal1.applicant,
        proposal1.tokenTribute,
        proposal1.bondsRequested,
        proposal1.details,
        { from: summoner }
      )

      await moveForwardPeriods(1)
      await james.submitVote(0, 1, { from: summoner })
    })

    it('proposal passes when applicant does not abort', async () => {
      await moveForwardPeriods(deploymentConfig.VOTING_DURATON_IN_PERIODS)
      await moveForwardPeriods(deploymentConfig.GRACE_DURATON_IN_PERIODS)
      await james.processProposal(0, { from: processor })
      await verifyProcessProposal(proposal1, 0, summoner, processor, {
        initialTotalSharesRequested: 1,
        initialTotalShares: 1,
        initialJamesBalance: 110,
        initialProposerBalance: initSummonerBalance - deploymentConfig.PROPOSAL_DEPOSIT,
        expectedYesVotes: 1,
        expectedMaxSharesAtYesVote: 1
      })
    })

    it('proposal fails when applicant aborts', async () => {
      await james.abort(0, { from: proposal1.applicant })

      await moveForwardPeriods(deploymentConfig.VOTING_DURATON_IN_PERIODS)
      await moveForwardPeriods(deploymentConfig.GRACE_DURATON_IN_PERIODS)
      await james.processProposal(0, { from: processor })
      await verifyProcessProposal(proposal1, 0, summoner, processor, {
        initialTotalSharesRequested: 1,
        initialTotalShares: 1,
        initialJamesBalance: 110,
        initialProposerBalance: initSummonerBalance - deploymentConfig.PROPOSAL_DEPOSIT,
        expectedYesVotes: 1,
        expectedMaxSharesAtYesVote: 1,
        didPass: false, // false because aborted
        aborted: true // proposal was aborted
      })
    })
  })

  describe('ragequit', () => {
    beforeEach(async () => {
      await token.transfer(proposal1.applicant, proposal1.tokenTribute, {
        from: creator
      })
      await token.approve(james.address, 10, { from: summoner })
      await token.approve(james.address, proposal1.tokenTribute, {
        from: proposal1.applicant
      })

      await james.submitProposal(
        proposal1.applicant,
        proposal1.tokenTribute,
        proposal1.bondsRequested,
        proposal1.details,
        { from: summoner }
      )

      await moveForwardPeriods(1)
      await james.submitVote(0, 1, { from: summoner })

      await moveForwardPeriods(deploymentConfig.VOTING_DURATON_IN_PERIODS)
      await moveForwardPeriods(deploymentConfig.GRACE_DURATON_IN_PERIODS)
    })

    it('happy case', async () => {
      await james.processProposal(0)
      await james.ragequit(1, { from: summoner })

      const totalShares = await james.totalShares()
      assert.equal(totalShares, proposal1.bondsRequested)

      const summonerData = await james.members(summoner)
      assert.equal(summonerData.bonds, 0)
      assert.equal(summonerData.exists, true)
      assert.equal(summonerData.highestIndexYesVote, 0)

      // can divide tokenTribute by 2 because 2 bonds
      const summonerBalance = await token.balanceOf(summoner)
      const expectedBalance =
        initSummonerBalance -
        deploymentConfig.PROCESSING_REWARD +
        proposal1.tokenTribute / 2
      assert.equal(+summonerBalance.toString(), expectedBalance)

      const jamesBalance = await token.balanceOf(james.address)
      assert.equal(jamesBalance, 0)

      // guild bank has the other half of the funds
      const guildBankBalance = await token.balanceOf(guildBank.address)
      assert.equal(guildBankBalance, proposal1.tokenTribute / 2)
    })

    it('require fail - insufficient bonds', async () => {
      await james.processProposal(0)
      await james
        .ragequit(2, { from: summoner })
        .should.be.rejectedWith('insufficient bonds')
    })

    it('require fail - cant ragequit yet', async () => {
      // skip processing the proposal
      await james
        .ragequit(1, { from: summoner })
        .should.be.rejectedWith(
          'cant ragequit until highest index proposal member voted YES on is processed'
        )
    })

    it('modifier - member - non-member', async () => {
      await james.processProposal(0)
      await james
        .ragequit(1, { from: creator })
        .should.be.rejectedWith('not a member')
    })

    it('modifier - member - member ragequit', async () => {
      await james.processProposal(0)
      await james.ragequit(1, { from: summoner })
      await james
        .ragequit(1, { from: summoner })
        .should.be.rejectedWith('not a member')
    })

    it('edge case - weth sent to guild bank can be withdrawn via ragequit', async () => {
      await james.processProposal(0)

      await token.transfer(guildBank.address, 100, { from: creator })
      const guildBankBalance1 = await token.balanceOf(guildBank.address)
      assert.equal(guildBankBalance1, proposal1.tokenTribute + 100)

      await james.ragequit(1, { from: summoner })

      const summonerBalance = await token.balanceOf(summoner)
      const expectedBalance =
        initSummonerBalance - deploymentConfig.PROCESSING_REWARD + guildBankBalance1 / 2
      assert.equal(+summonerBalance.toString(), expectedBalance)

      const guildBankBalance2 = await token.balanceOf(guildBank.address)
      assert.equal(guildBankBalance2, guildBankBalance1 / 2)
    })

    // TODO how might guildbank withdrawal fail?
    // - it could uint256 overflow
  })

  describe('abort', () => {
    beforeEach(async () => {
      await token.transfer(proposal1.applicant, proposal1.tokenTribute, {
        from: creator
      })
      await token.approve(james.address, 10, { from: summoner })
      await token.approve(james.address, proposal1.tokenTribute, {
        from: proposal1.applicant
      })

      await james.submitProposal(
        proposal1.applicant,
        proposal1.tokenTribute,
        proposal1.bondsRequested,
        proposal1.details,
        { from: summoner }
      )
    })

    it('happy case', async () => {
      await james.abort(0, { from: proposal1.applicant })

      const proposal = await james.proposalQueue.call(0)
      assert.equal(proposal.tokenTribute, 0)
      assert.equal(proposal.bondsRequested, 1)
      assert.equal(proposal.yesVotes, 0)
      assert.equal(proposal.noVotes, 0)
      assert.equal(proposal.maxTotalSharesAtYesVote, 0)
      assert.equal(proposal.processed, false)
      assert.equal(proposal.didPass, false)
      assert.equal(proposal.aborted, true)

      const totalSharesRequested = await james.totalSharesRequested()
      assert.equal(totalSharesRequested, 1)

      const totalShares = await james.totalShares()
      assert.equal(totalShares, 1)

      const jamesBalance = await token.balanceOf(james.address)
      assert.equal(jamesBalance, deploymentConfig.PROPOSAL_DEPOSIT)

      const summonerBalance = await token.balanceOf(summoner)
      assert.equal(
        summonerBalance,
        initSummonerBalance - deploymentConfig.PROPOSAL_DEPOSIT
      )

      const applicantBalance = await token.balanceOf(proposal1.applicant)
      assert.equal(applicantBalance, proposal1.tokenTribute)
    })

    it('require fail - proposal does not exist', async () => {
      await james
        .abort(1, { from: proposal1.applicant })
        .should.be.rejectedWith('proposal does not exist')
    })

    it('require fail - msg.sender must be applicant', async () => {
      await james
        .abort(0, { from: summoner })
        .should.be.rejectedWith('msg.sender must be applicant')
    })

    it('require fail - proposal must not have already been aborted', async () => {
      await james.abort(0, { from: proposal1.applicant })
      await james
        .abort(0, { from: proposal1.applicant })
        .should.be.rejectedWith('proposal must not have already been aborted')
    })

    describe('abort window boundary', () => {
      it('require fail - abort window must not have passed', async () => {
        await moveForwardPeriods(deploymentConfig.ABORT_WINDOW_IN_PERIODS + 1)
        await james
          .abort(0, { from: proposal1.applicant })
          .should.be.rejectedWith('abort window must not have passed')
      })

      it('success - abort 1 period before abort window expires', async () => {
        await moveForwardPeriods(deploymentConfig.ABORT_WINDOW_IN_PERIODS)
        await james.abort(0, { from: proposal1.applicant })

        const proposal = await james.proposalQueue.call(0)
        assert.equal(proposal.tokenTribute, 0)
        assert.equal(proposal.aborted, true)

        const applicantBalance = await token.balanceOf(proposal1.applicant)
        assert.equal(applicantBalance, proposal1.tokenTribute)
      })
    })
  })

  describe('updateDelegateKey', () => {
    beforeEach(async () => {
      // vote in a new member to test failing requires
      await token.transfer(proposal1.applicant, proposal1.tokenTribute, {
        from: creator
      })
      await token.approve(james.address, 10, { from: summoner })
      await token.approve(james.address, proposal1.tokenTribute, {
        from: proposal1.applicant
      })

      await james.submitProposal(
        proposal1.applicant,
        proposal1.tokenTribute,
        proposal1.bondsRequested,
        proposal1.details,
        { from: summoner }
      )

      await moveForwardPeriods(1)
      await james.submitVote(0, 1, { from: summoner })

      await moveForwardPeriods(deploymentConfig.VOTING_DURATON_IN_PERIODS)
      await moveForwardPeriods(deploymentConfig.GRACE_DURATON_IN_PERIODS)
      await james.processProposal(0, { from: processor })
    })

    it('happy case', async () => {
      await james.updateDelegateKey(creator, { from: summoner })
      await verifyUpdateDelegateKey(summoner, summoner, creator)
    })

    it('require fail - newDelegateKey cannot be 0', async () => {
      await james
        .updateDelegateKey(zeroAddress, { from: summoner })
        .should.be.rejectedWith('newDelegateKey cannot be 0')
    })

    it('require fail - cant overwrite existing members', async () => {
      await james
        .updateDelegateKey(proposal1.applicant, { from: summoner })
        .should.be.rejectedWith('cant overwrite existing members')
    })

    it('require fail - cant overwrite existing delegate keys', async () => {
      // first set the p1 applicant delegate key to the creator
      await james.updateDelegateKey(creator, { from: proposal1.applicant })
      // then try to overwrite it
      await james
        .updateDelegateKey(creator, { from: summoner })
        .should.be.rejectedWith('cant overwrite existing delegate keys')
    })

    it('modifier - member', async () => {
      await james
        .updateDelegateKey(creator, { from: creator })
        .should.be.rejectedWith('not a member')
    })

    it('edge - can reset the delegatekey to your own member address', async () => {
      // first set the delegate key to the creator
      await james.updateDelegateKey(creator, { from: summoner })
      await verifyUpdateDelegateKey(summoner, summoner, creator)
      // then reset it to the summoner
      await james.updateDelegateKey(summoner, { from: summoner })
      await verifyUpdateDelegateKey(summoner, creator, summoner)
    })
  })

  describe('guildbank.withdraw', () => {
    it('modifier - owner', async () => {
      await guildBank
        .withdraw(summoner, 1, 1)
        .should.be.rejectedWith(SolRevert)
    })
  })

  describe('two proposals', () => {
    beforeEach(async () => {
      proposal2 = {
        applicant: applicant2,
        tokenTribute: 200,
        bondsRequested: 2,
        details: ''
      }

      await token.transfer(proposal1.applicant, proposal1.tokenTribute, {
        from: creator
      })
      await token.approve(james.address, proposal1.tokenTribute, {
        from: proposal1.applicant
      })

      await token.transfer(proposal2.applicant, proposal2.tokenTribute, {
        from: creator
      })
      await token.approve(james.address, proposal2.tokenTribute, {
        from: proposal2.applicant
      })

      await token.approve(james.address, 20, { from: summoner })

      await james.submitProposal(
        proposal1.applicant,
        proposal1.tokenTribute,
        proposal1.bondsRequested,
        proposal1.details,
        { from: summoner }
      )
    })

    it('processProposal require fail - previous proposal must be processed', async () => {
      await james.submitProposal(
        proposal2.applicant,
        proposal2.tokenTribute,
        proposal2.bondsRequested,
        proposal2.details,
        { from: summoner }
      )
      await moveForwardPeriods(2)
      await moveForwardPeriods(deploymentConfig.VOTING_DURATON_IN_PERIODS)
      await moveForwardPeriods(deploymentConfig.GRACE_DURATON_IN_PERIODS)
      await james
        .processProposal(1)
        .should.be.rejectedWith('previous proposal must be processed')

      // works after the first proposal is processed
      await james.processProposal(0)
      await james.processProposal(1)
      const proposalData = await james.proposalQueue(1)
      assert.equal(proposalData.processed, true)
    })

    it('submit proposal - starting period is correctly set with gaps in proposal queue', async () => {
      await moveForwardPeriods(4) // 0 -> 4
      await james.submitProposal(
        proposal2.applicant,
        proposal2.tokenTribute,
        proposal2.bondsRequested,
        proposal2.details,
        { from: summoner }
      )
      const proposalData = await james.proposalQueue(1)
      assert.equal(proposalData.startingPeriod, 5)
    })

    it('submit proposal - starting period is correctly set when another proposal is ahead in the queue', async () => {
      await moveForwardPeriods(1) // 0 -> 1
      await james.submitProposal(
        proposal2.applicant,
        proposal2.tokenTribute,
        proposal2.bondsRequested,
        proposal2.details,
        { from: summoner }
      )
      const proposalData = await james.proposalQueue(1)
      assert.equal(proposalData.startingPeriod, 2)
    })

    it('submitVote - yes - dont update highestIndexYesVote', async () => {
      await james.submitProposal(
        proposal2.applicant,
        proposal2.tokenTribute,
        proposal2.bondsRequested,
        proposal2.details,
        { from: summoner }
      )
      await moveForwardPeriods(2)

      // vote yes on proposal 2
      await james.submitVote(1, 1, { from: summoner })
      const memberData1 = await james.members(summoner)
      assert.equal(memberData1.highestIndexYesVote, 1)
      await verifySubmitVote(proposal2, 1, summoner, 1, {
        expectedMaxSharesAtYesVote: 1
      })

      // vote yes on proposal 1
      await james.submitVote(0, 1, { from: summoner })
      await verifySubmitVote(proposal1, 0, summoner, 1, {
        expectedMaxSharesAtYesVote: 1
      })

      // highestIndexYesVote should stay the same
      const memberData2 = await james.members(summoner)
      assert.equal(memberData2.highestIndexYesVote, 1)
    })
  })

  describe('two members', () => {
    beforeEach(async () => {
      // 3 so total bonds is 4 and we can test ragequit + dilution boundary
      proposal1.bondsRequested = 3

      await token.transfer(proposal1.applicant, proposal1.tokenTribute, {
        from: creator
      })
      await token.approve(james.address, 10, { from: summoner })
      await token.approve(james.address, proposal1.tokenTribute, {
        from: proposal1.applicant
      })

      await james.submitProposal(
        proposal1.applicant,
        proposal1.tokenTribute,
        proposal1.bondsRequested,
        proposal1.details,
        { from: summoner }
      )

      await moveForwardPeriods(1)
      await james.submitVote(0, 1, { from: summoner })

      await moveForwardPeriods(deploymentConfig.VOTING_DURATON_IN_PERIODS)
      await moveForwardPeriods(deploymentConfig.GRACE_DURATON_IN_PERIODS)
      await james.processProposal(0, { from: processor })

      proposal2 = {
        applicant: applicant2,
        tokenTribute: 200,
        bondsRequested: 2,
        details: ''
      }

      await token.transfer(proposal2.applicant, proposal2.tokenTribute, {
        from: creator
      })
      await token.approve(james.address, proposal2.tokenTribute, {
        from: proposal2.applicant
      })

      await token.approve(james.address, 10, { from: summoner })

      await james.submitProposal(
        proposal2.applicant,
        proposal2.tokenTribute,
        proposal2.bondsRequested,
        proposal2.details,
        { from: summoner }
      )
      await moveForwardPeriods(1)
    })

    it('proposal fails when dilution bound is exceeded', async () => {
      const member1 = proposal1.applicant

      await james.submitVote(1, 1, { from: summoner })
      const proposalData = await james.proposalQueue(1)
      assert.equal(proposalData.maxTotalSharesAtYesVote, 4)

      await james.ragequit(3, { from: member1 })
      await moveForwardPeriods(deploymentConfig.VOTING_DURATON_IN_PERIODS)
      await moveForwardPeriods(deploymentConfig.GRACE_DURATON_IN_PERIODS)
      await james.processProposal(1, { from: processor })

      await verifyProcessProposal(proposal2, 1, summoner, processor, {
        initialTotalSharesRequested: 2,
        initialTotalShares: 1, // 4 -> 1
        initialJamesBalance: 210,
        initialGuildBankBalance: 25, // 100 -> 25
        initialProposerBalance:
          initSummonerBalance -
          deploymentConfig.PROPOSAL_DEPOSIT -
          deploymentConfig.PROCESSING_REWARD,
        initialProcessorBalance: 1,
        expectedYesVotes: 1,
        expectedMaxSharesAtYesVote: 4,
        didPass: false
      })
    })

    it('proposal passes when dilution bound is not exceeded', async () => {
      const member1 = proposal1.applicant

      await james.submitVote(1, 1, { from: summoner })
      const proposalData = await james.proposalQueue(1)
      assert.equal(proposalData.maxTotalSharesAtYesVote, 4)

      await james.ragequit(2, { from: member1 })
      await moveForwardPeriods(deploymentConfig.VOTING_DURATON_IN_PERIODS)
      await moveForwardPeriods(deploymentConfig.GRACE_DURATON_IN_PERIODS)
      await james.processProposal(1, { from: processor })

      await verifyProcessProposal(proposal2, 1, summoner, processor, {
        initialTotalSharesRequested: 2,
        initialTotalShares: 2, // 4 -> 2
        initialJamesBalance: 210,
        initialGuildBankBalance: 50, // 100 -> 50
        initialProposerBalance:
          initSummonerBalance -
          deploymentConfig.PROPOSAL_DEPOSIT -
          deploymentConfig.PROCESSING_REWARD,
        initialProcessorBalance: 1,
        expectedYesVotes: 1,
        expectedMaxSharesAtYesVote: 4,
        didPass: true
      })
    })
  })

  describe('Gnosis Safe Integration', () => {
    // These tests fail when running solidity-coverage
    if (process.env.RUNNING_COVERAGE) {
      return
    }

    let executor
    let lw

    beforeEach(async () => {
      executor = creator // used to execute gnosis safe transactions

      // Create lightwallet
      lw = await utils.createLightwallet()
      // Create Gnosis Safe

      let gnosisSafeData = await gnosisSafeMasterCopy.contract.methods.setup([lw.accounts[0], lw.accounts[1], lw.accounts[2]], 2, zeroAddress, '0x', zeroAddress, 0, zeroAddress).encodeABI()

      gnosisSafe = await utils.getParamFromTxEvent(
        await proxyFactory.createProxy(gnosisSafeMasterCopy.address, gnosisSafeData),
        'ProxyCreation', 'proxy', proxyFactory.address, GnosisSafe, 'create Gnosis Safe'
      )

      // Transfer Tokens to Gnosis Safe
      await token.transfer(gnosisSafe.address, 100, { from: creator })

      // Transfer ETH to Gnosis Safe (because safe pays executor for gas)
      await web3.eth.sendTransaction({
        from: creator,
        to: gnosisSafe.address,
        value: web3.utils.toWei('1', 'ether')
      })

      proposal1.applicant = gnosisSafe.address
    })

    it('sends ether', async () => {
      const initSafeBalance = await web3.eth.getBalance(gnosisSafe.address)
      assert.equal(initSafeBalance, 1000000000000000000)
      await safeUtils.executeTransaction(lw, gnosisSafe, 'executeTransaction withdraw 1 ETH', [lw.accounts[0], lw.accounts[2]], creator, web3.utils.toWei('1', 'ether'), '0x', CALL, summoner)
      const safeBalance = await web3.eth.getBalance(gnosisSafe.address)
      assert.equal(safeBalance, 0)
    })

    it('token approval', async () => {
      let data = await token.contract.methods.approve(james.address, 100).encodeABI()
      await safeUtils.executeTransaction(lw, gnosisSafe, 'approve token transfer to james', [lw.accounts[0], lw.accounts[1]], token.address, 0, data, CALL, executor)
      const approvedAmount = await token.allowance(gnosisSafe.address, james.address)
      assert.equal(approvedAmount, 100)
    })

    it('abort', async () => {
      // approve 100 eth from safe to james
      let data = await token.contract.methods.approve(james.address, 100).encodeABI()
      await safeUtils.executeTransaction(lw, gnosisSafe, 'approve token transfer to james', [lw.accounts[0], lw.accounts[1]], token.address, 0, data, CALL, executor)

      // summoner approve for proposal deposit
      await token.approve(james.address, 10, { from: summoner })
      // summoner submits proposal for safe
      await james.submitProposal(proposal1.applicant, proposal1.tokenTribute, proposal1.bondsRequested, proposal1.details, { from: summoner })

      // ABORT - gnosis safe aborts
      const abortData = await james.contract.methods.abort(0).encodeABI()
      await safeUtils.executeTransaction(lw, gnosisSafe, 'approve token transfer to james', [lw.accounts[0], lw.accounts[1]], james.address, 0, abortData, CALL, executor)
      const abortedProposal = await james.proposalQueue.call(0)
      assert.equal(abortedProposal.tokenTribute, 0)
    })

    describe('as a member, can execute all functions', async () => {
      beforeEach(async () => {
        // approve 100 eth from safe to james
        let data = await token.contract.methods.approve(james.address, 100).encodeABI()
        await safeUtils.executeTransaction(lw, gnosisSafe, 'approve token transfer to james', [lw.accounts[0], lw.accounts[1]], token.address, 0, data, CALL, executor)

        // summoner approves tokens and submits proposal for safe
        await token.approve(james.address, 10, { from: summoner })
        await james.submitProposal(proposal1.applicant, proposal1.tokenTribute, proposal1.bondsRequested, proposal1.details, { from: summoner })

        // summoner votes yes for safe
        await moveForwardPeriods(1)
        await james.submitVote(0, 1, { from: summoner })

        // fast forward until safe is a member
        await moveForwardPeriods(deploymentConfig.VOTING_DURATON_IN_PERIODS)
        await moveForwardPeriods(deploymentConfig.GRACE_DURATON_IN_PERIODS)
        await james.processProposal(0, { from: processor })
      })

      it('submit proposal -> vote -> update delegate -> ragequit', async () => {
        // confirm that the safe is a member
        const safeMemberData = await james.members(gnosisSafe.address)
        assert.equal(safeMemberData.exists, true)

        // create a new proposal
        proposal2 = {
          applicant: applicant1,
          tokenTribute: 100,
          bondsRequested: 2,
          details: ''
        }

        // send the applicant 100 tokens and have them do the approval
        await token.transfer(proposal2.applicant, proposal2.tokenTribute, { from: creator })
        await token.approve(james.address, proposal2.tokenTribute, { from: proposal2.applicant })

        // safe needs to approve 10 for the deposit (get 10 more from creator)
        await token.transfer(gnosisSafe.address, 10, { from: creator })
        let data = await token.contract.methods.approve(james.address, 10).encodeABI()
        await safeUtils.executeTransaction(lw, gnosisSafe, 'approve token transfer to james', [lw.accounts[0], lw.accounts[1]], token.address, 0, data, CALL, executor)

        // safe submits proposal
        let submitProposalData = await james.contract.methods.submitProposal(proposal2.applicant, proposal2.tokenTribute, proposal2.bondsRequested, proposal2.details).encodeABI()
        await safeUtils.executeTransaction(lw, gnosisSafe, 'submit proposal to james', [lw.accounts[0], lw.accounts[1]], james.address, 0, submitProposalData, CALL, executor)

        const expectedStartingPeriod = (await james.getCurrentPeriod()).toNumber() + 1
        await verifySubmitProposal(proposal2, 1, gnosisSafe.address, {
          initialTotalShares: 2,
          initialProposalLength: 1,
          initialApplicantBalance: proposal2.tokenTribute,
          initialProposerBalance: 10,
          expectedStartingPeriod: expectedStartingPeriod
        })

        // safe submits vote
        await moveForwardPeriods(1)
        let voteData = await james.contract.methods.submitVote(1, 2).encodeABI() // vote no so we can ragequit easier
        await safeUtils.executeTransaction(lw, gnosisSafe, 'submit vote to james', [lw.accounts[0], lw.accounts[1]], james.address, 0, voteData, CALL, executor)
        await verifySubmitVote(proposal1, 1, gnosisSafe.address, 2, {})

        const newDelegateKey = delegateKey

        // safe updates delegate key
        const updateDelegateData = await james.contract.methods.updateDelegateKey(newDelegateKey).encodeABI()
        await safeUtils.executeTransaction(lw, gnosisSafe, 'update delegate key', [lw.accounts[0], lw.accounts[1]], james.address, 0, updateDelegateData, CALL, executor)
        await verifyUpdateDelegateKey(gnosisSafe.address, gnosisSafe.address, newDelegateKey)

        // safe ragequits
        const ragequitData = await james.contract.methods.ragequit(1).encodeABI()
        await safeUtils.executeTransaction(lw, gnosisSafe, 'ragequit the guild', [lw.accounts[0], lw.accounts[1]], james.address, 0, ragequitData, CALL, executor)
        const safeMemberDataAfterRagequit = await james.members(gnosisSafe.address)
        assert.equal(safeMemberDataAfterRagequit.exists, true)
        assert.equal(safeMemberDataAfterRagequit.bonds, 0)

        const safeBalanceAfterRagequit = await token.balanceOf(gnosisSafe.address)
        assert.equal(safeBalanceAfterRagequit, 50) // 100 eth & 2 bonds at time of ragequit
      })
    })
  })
})
