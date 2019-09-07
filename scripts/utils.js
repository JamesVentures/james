/* global buidlerArguments artifacts config web3 */
const BN = require('bn.js')

// These functions are meant to be run from tasks, so the
// BuidlerRuntimeEnvironment is available in the global scope.

/**
 * Returns the deployed instance of the James DAO, or undefined if its
 * address hasn't been set in the config.
 */
async function getDeployedJames () {
  const jamesAddress = getJamesAddress()
  if (!jamesAddress) {
    console.error(`Please, set the DAO's address in buidler.config.js's networks.${buidlerArguments.network}.deployedContracts.james`)
    return
  }

  const James = artifacts.require('James')
  return James.at(jamesAddress)
}

/**
 * Returns the deployed instance of the JamesPool contract, or undefined if its
 * address hasn't been set in the config.
 */
async function getDeployedPool () {
  const poolAddress = getPoolAddress()
  if (!poolAddress) {
    console.error(`Please, set the Pool's address in buidler.config.js's networks.${buidlerArguments.network}.deployedContracts.pool`)
    return
  }

  const Pool = artifacts.require('JamesPool')
  return Pool.at(poolAddress)
}

/**
 * Returns the deployed instance of the James DAO's approved token, or
 * undefined if the DAO's address hasn't been set in the config.
 */
async function getApprovedToken () {
  const james = await getDeployedJames()
  if (james === undefined) {
    return
  }

  const IERC20 = artifacts.require('IERC20')
  const tokenAddress = await james.approvedToken()

  return IERC20.at(tokenAddress)
}

/**
 * Returns the address of the James DAO as set in the config, or undefined if
 * it hasn't been set.
 */
function getJamesAddress () {
  return config.networks[buidlerArguments.network].deployedContracts.james
}

/**
 * Returns the address of the JamesPool as set in the config, or undefined if
 * it hasn't been set.
 */
function getPoolAddress () {
  return config.networks[buidlerArguments.network].deployedContracts.pool
}

async function giveAllowance (tokenContract, allowanceGiver, receiverContract, amount) {
  return tokenContract.approve(receiverContract.address, amount, { from: allowanceGiver })
}

async function hasEnoughAllowance (tokenContract, allowanceGiver, receiverContract, amount) {
  const allowance = await tokenContract.allowance(allowanceGiver, receiverContract.address)
  return allowance.gte(new BN(amount))
}

async function hasEnoughTokens (tokenContract, tokensOwner, amount) {
  const balance = await tokenContract.balanceOf(tokensOwner)
  return balance.gte(new BN(amount))
}

async function getFirstAccount () {
  const accounts = await web3.eth.getAccounts()
  return accounts[0]
}

async function hasEnoughPoolShares (pool, owner, amount) {
  const shares = await pool.donors(owner)

  return shares.gte(new BN(amount))
}

module.exports = {
  getDeployedJames,
  getDeployedPool,
  getApprovedToken,
  getJamesAddress,
  getPoolAddress,
  giveAllowance,
  hasEnoughAllowance,
  hasEnoughTokens,
  getFirstAccount,
  hasEnoughPoolShares
}
