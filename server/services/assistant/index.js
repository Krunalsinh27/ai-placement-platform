const assistantTools = require('./assistantTools');
const intentRouter = require('./intentRouter');

module.exports = {
  ...assistantTools,
  ...intentRouter,
};

