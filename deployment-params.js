// Deployment params

require('dotenv').config()

module.exports.SUMMONER = process.env.SUMMONER
module.exports.TOKEN = process.env.TOKEN
module.exports.PERIOD_DURATION_IN_SECONDS = 17280
module.exports.VOTING_DURATON_IN_PERIODS = 5
module.exports.GRACE_DURATON_IN_PERIODS = 5
module.exports.ABORT_WINDOW_IN_PERIODS = 5
module.exports.PROPOSAL_DEPOSIT = '7000000000000000' // Large numbers should be string or big numbers
module.exports.DILUTION_BOUND = 3
module.exports.PROCESSING_REWARD = '700000000'
