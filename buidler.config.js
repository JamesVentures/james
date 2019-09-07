/* global usePlugin */
usePlugin('@nomiclabs/buidler-truffle5')

require('./scripts/james-tasks')
require('./scripts/pool-tasks')

require('dotenv').config()

const INFURA_API_KEY = process.env.INFURA_API_KEY
const MAINNET_PRIVATE_KEY = process.env.MAINNET_PRIVATE_KEY
const ROPSTEN_PRIVATE_KEY = process.env.ROPSTEN_PRIVATE_KEY

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
        james: '',
        pool: ''
      }
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
      accounts: [ MAINNET_PRIVATE_KEY ],
      deployedContracts: {
        james: '', // The original James
        pool: ''
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
