/* global usePlugin */
usePlugin('@nomiclabs/buidler-truffle5')

require('./scripts/james-tasks')
require('./scripts/pool-tasks')

require('dotenv').config()

const INFURA_API_KEY = process.env.INFURA_API_KEY
const MAINNET_PRIVATE_KEY = process.env.MAINNET_PRIVATE_KEY
const ROPSTEN_PRIVATE_KEY = process.env.ROPSTEN_PRIVATE_KEY
const ROPSTEN_JAMES = process.env.ROPSTEN_JAMES

module.exports = {
  networks: {
    develop: {
      deployedContracts: {
        james: '',
        pool: ''
      }
    },
    ropsten: {
      url: `https://ropsten.infura.io/v3/${INFURA_API_KEY}`,
      accounts: [ ROPSTEN_PRIVATE_KEY ],
      deployedContracts: {
        james: ROPSTEN_JAMES,
        pool: ''
      }
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
      accounts: [ MAINNET_PRIVATE_KEY ],
      gasPrice: 12000000000,
      deployedContracts: {
        james: '0x77b53ad9d111029d1f16f4f19769846384bda49b', // The original James
        pool: '0x1A994dDb50FE45c485a22F1ea0BEB29Fcfc02B66'
      }
    },
    coverage: {
      url: 'http://localhost:8555'
    }
  },
  solc: {
    version: '0.5.3',
    evmVersion: 'byzantium'
  }
}
