/* global task buidlerArguments artifacts types */
const BN = require('bn.js')
const deploymentParams = require('../deployment-params')

const {
  getDeployedJames,
  getFirstAccount,
  getApprovedToken,
  hasEnoughTokens,
  hasEnoughAllowance,
  giveAllowance
} = require('./utils')

task('james-deploy', 'Deploys a new instance of the James DAO')
  .setAction(async () => {
    if (deploymentParams.SUMMONER === '' || deploymentParams.TOKEN === '') {
      console.error('Please set the deployment parameters in deployment-params.js')
      return
    }

    // Make sure everything is compiled
    await run('compile')

    console.log('Deploying a new DAO to the network ' + buidlerArguments.network)
    console.log(
      'Deployment parameters:\n',
      '  summoner:', deploymentParams.SUMMONER, '\n',
      '  token:', deploymentParams.TOKEN, '\n',
      '  periodSeconds:', deploymentParams.PERIOD_DURATION_IN_SECONDS, '\n',
      '  votingPeriods:', deploymentParams.VOTING_DURATON_IN_PERIODS, '\n',
      '  gracePeriods:', deploymentParams.GRACE_DURATON_IN_PERIODS, '\n',
      '  abortPeriods:', deploymentParams.ABORT_WINDOW_IN_PERIODS, '\n',
      '  proposalDeposit:', deploymentParams.PROPOSAL_DEPOSIT, '\n',
      '  dilutionBound:', deploymentParams.DILUTION_BOUND, '\n',
      '  processingReward:', deploymentParams.PROCESSING_REWARD, '\n'
    )

    const Confirm = require('prompt-confirm')
    const prompt = new Confirm('Please confirm that the deployment parameters are correct')
    const confirmation = await prompt.run()

    if (!confirmation) {
      return
    }

    const James = artifacts.require('James')

    console.log('Deploying...')
    const james = await James.new(
      deploymentParams.SUMMONER,
      deploymentParams.TOKEN,
      deploymentParams.PERIOD_DURATION_IN_SECONDS,
      deploymentParams.VOTING_DURATON_IN_PERIODS,
      deploymentParams.GRACE_DURATON_IN_PERIODS,
      deploymentParams.ABORT_WINDOW_IN_PERIODS,
      deploymentParams.PROPOSAL_DEPOSIT,
      deploymentParams.DILUTION_BOUND,
      deploymentParams.PROCESSING_REWARD
    )

    console.log('')
    console.log('James DAO deployed. Address:', james.address)
    console.log('Set this address in buidler.config.js\'s networks section to use the other tasks')
  })

task('james-submit-proposal', 'Submits a proposal')
  .addParam('applicant', 'The address of the applicant')
  .addParam('tribute', "The number of token's wei offered as tribute")
  .addParam('bonds', 'The number of bonds requested')
  .addParam('details', "The proposal's details")
  .setAction(async ({ applicant, tribute, bonds, details }) => {
    // Make sure everything is compiled
    await run('compile')

    const james = await getDeployedJames()
    if (james === undefined) {
      return
    }

    const token = await getApprovedToken()
    if (token === undefined) {
      return
    }

    const proposalDeposit = await james.proposalDeposit()
    const sender = await getFirstAccount()

    if (!await hasEnoughTokens(token, sender, proposalDeposit)) {
      console.error("You don't have enough tokens to pay the deposit")
      return
    }

    if (!await hasEnoughAllowance(token, sender, james, proposalDeposit)) {
      await giveAllowance(token, sender, james, proposalDeposit)
    }

    if (new BN(tribute).gt(new BN(0))) {
      if (!await hasEnoughTokens(token, applicant, tribute)) {
        console.error("The applicant doesn't have enough tokens to pay the tribute")
        return
      }

      if (!await hasEnoughAllowance(token, applicant, james, tribute)) {
        console.error('The applicant must give allowance to the DAO before being proposed')
        return
      }
    }

    const { receipt } = await james.submitProposal(applicant, tribute, bonds, details)
    const proposalIndex = receipt.logs[0].args.proposalIndex

    console.log('Submitted proposal number', proposalIndex.toString())
  })

task('james-submit-vote', 'Submits a vote')
  .addParam('proposal', 'The proposal number', undefined, types.int)
  .addParam('vote', 'The vote (yes/no)')
  .setAction(async ({ proposal, vote }) => {
    // Make sure everything is compiled
    await run('compile')

    const james = await getDeployedJames()
    if (james === undefined) {
      return
    }

    if (vote.toLowerCase() !== 'yes' && vote.toLowerCase() !== 'no') {
      console.error('Invalid vote. It must be "yes" or "no".')
      return
    }

    const voteNumber = vote.toLowerCase() === 'yes' ? 1 : 2

    await james.submitVote(proposal, voteNumber)
    console.log('Vote submitted')
  })

task('james-process-proposal', 'Processes a proposal')
  .addParam('proposal', 'The proposal number', undefined, types.int)
  .setAction(async ({ proposal }) => {
    // Make sure everything is compiled
    await run('compile')

    const james = await getDeployedJames()
    if (james === undefined) {
      return
    }

    await james.processProposal(proposal)
    console.log('Proposal processed')
  })

task('james-ragequit', 'Ragequits, burning some bonds and getting tokens back')
  .addParam('bonds', 'The amount of bonds to burn')
  .setAction(async ({ bonds }) => {
    // Make sure everything is compiled
    await run('compile')

    const james = await getDeployedJames()
    if (james === undefined) {
      return
    }

    await james.ragequit(bonds)
    console.log(`Burn ${bonds} bonds`)
  })

task('james-update-delegate', 'Updates your delegate')
  .addParam('delegate', "The new delegate's address")
  .setAction(async ({ delegate }) => {
    // Make sure everything is compiled
    await run('compile')

    const james = await getDeployedJames()
    if (james === undefined) {
      return
    }

    await james.updateDelegateKey(delegate)
    console.log(`Delegate updated`)
  })
