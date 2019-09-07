/* global task buidlerArguments types artifacts */
const BN = require('bn.js')

const {
  getDeployedJames,
  getDeployedPool,
  getFirstAccount,
  getApprovedToken,
  hasEnoughTokens,
  hasEnoughAllowance,
  giveAllowance,
  hasEnoughPoolShares
} = require('./utils')

task('pool-deploy', 'Deploys a new instance of the pool and activates it')
  .addParam('tokens', 'The initial amount of tokens to deposit')
  .addParam('bonds', 'The initial amount of bonds to mint')
  .setAction(async ({ tokens, bonds }) => {
    // Make sure everything is compiled
    await run('compile')

    const james = await getDeployedJames()
    if (!james) {
      return
    }

    const token = await getApprovedToken()
    if (!token) {
      return
    }

    console.log('Deploying a new Pool to network ' + buidlerArguments.network)

    console.log(
      'Deployment parameters:\n',
      '  James DAO:', james.address, '\n',
      '  initialTokens:', tokens, '\n',
      '  initialPoolShares:', bonds, '\n'
    )

    const Confirm = require('prompt-confirm')
    const prompt = new Confirm('Please confirm that the deployment parameters are correct')
    const confirmation = await prompt.run()

    if (!confirmation) {
      return
    }

    const Pool = artifacts.require('JamesPool')
    const sender = await getFirstAccount()

    if (!await hasEnoughTokens(token, sender, tokens)) {
      console.error("You don't have enough tokens")
      return
    }

    console.log('Deploying...')

    // We set the gas manually here because of
    // https://github.com/nomiclabs/buidler/issues/272
    // TODO(@alcuadrado): Remove this when the issue gets fixed
    const pool = await Pool.new(james.address, { gas: 2500000 })

    console.log('')
    console.log('Pool deployed. Address:', pool.address)
    console.log("Set this address in buidler.config.js's networks section to use the other tasks")

    if (!await hasEnoughAllowance(token, sender, pool, tokens)) {
      await giveAllowance(token, sender, pool, tokens)
    }

    await pool.activate(tokens, bonds)

    console.log('The pool is now active')
  })

task('pool-sync', 'Syncs the pool')
  .addParam('proposal', 'The last proposal to sync', undefined, types.int)
  .setAction(async ({ proposal }) => {
    // Make sure everything is compiled
    await run('compile')

    const pool = await getDeployedPool()
    if (!pool) {
      return
    }

    proposal = new BN(proposal)

    await pool.sync(proposal.add(new BN(1)))

    const index = await pool.currentProposalIndex()

    if (index.eq(new BN(0))) {
      console.log('No proposal is ready to be synced')
      return
    }

    console.log('Pool synced up to', index.sub(new BN(1)).toString())
  })

task('pool-deposit', 'Donates tokens to the pool')
  .addParam('tokens', 'The amount of tokens to deposit')
  .setAction(async ({ tokens }) => {
    // Make sure everything is compiled
    await run('compile')

    const pool = await getDeployedPool()
    if (!pool) {
      return
    }

    const token = await getApprovedToken()
    if (!token) {
      return
    }

    const sender = await getFirstAccount()

    if (!await hasEnoughTokens(token, sender, tokens)) {
      console.error("You don't have enough tokens")
      return
    }

    if (!await hasEnoughAllowance(token, sender, pool, tokens)) {
      await giveAllowance(token, sender, pool, tokens)
    }

    await pool.deposit(tokens)

    console.log('Tokens deposited')
  })

task('pool-withdraw', 'Withdraw tokens from the pool')
  .addParam('bonds', 'The amount of bonds to burn')
  .setAction(async ({ bonds }) => {
    // Make sure everything is compiled
    await run('compile')

    const pool = await getDeployedPool()
    if (!pool) {
      return
    }

    const sender = await getFirstAccount()
    if (!await hasEnoughPoolShares(pool, sender, bonds)) {
      console.log("You don't have enough bonds")
      return
    }

    await pool.withdraw(bonds)
    console.log('Successful withdrawal')
  })

task('pool-keeper-withdraw', "Withdraw other users' tokens from the pool")
  .addParam('bonds', 'The amount of bonds to burn')
  .addParam('owner', 'The owner of the tokens')
  .setAction(async ({ bonds, owner }) => {
    // Make sure everything is compiled
    await run('compile')

    const pool = await getDeployedPool()
    if (!pool) {
      return
    }

    if (!await hasEnoughPoolShares(pool, owner, bonds)) {
      console.log("The owner of the tokens doesn't have enough bonds")
      return
    }

    try {
      await pool.keeperWithdraw(bonds, owner)
      console.log('Withdrawal was successful')
    } catch (error) {
      console.error('Withdrawal failed. Make sure that you are actually a keeper')
      console.error(error)
    }
  })

task('pool-add-keeper', 'Adds a keeper')
  .addParam('keeper', "The keeper's address")
  .setAction(async ({ keeper }) => {
    // Make sure everything is compiled
    await run('compile')

    const pool = await getDeployedPool()
    if (!pool) {
      return
    }

    await pool.addKeepers([keeper])
    console.log('Keeper added')
  })

task('pool-remove-keeper', 'Removes a keeper')
  .addParam('keeper', "The keeper's address")
  .setAction(async ({ keeper }) => {
    // Make sure everything is compiled
    await run('compile')

    const pool = await getDeployedPool()
    if (!pool) {
      return
    }

    await pool.removeKeepers([keeper])
    console.log('Keeper removed')
  })
