/**
 * The built Puzzles core a script runs against: the first argument names the folder `tsc` wrote,
 * as each script's header shows. Prints the usage and exits on a missing argument.
 */
const path = require('path');

function builtCore(usage) {
  const [, , built, ...rest] = process.argv;
  if (!built) {
    console.error(`usage: ${usage}`);
    process.exit(2);
  }
  return { core: require(path.resolve(built, 'index.js')), rest };
}

module.exports = { builtCore };
