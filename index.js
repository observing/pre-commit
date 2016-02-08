'use strict';

// Polyfill Promise if running on Node < 0.11
// Note:  Must modify global Promise for buffered-spawn
if ('undefined' === typeof Promise) {
  global.Promise = require('bluebird').Promise;
}

var spawn = require('cross-spawn')
  , which = require('which')
  , path = require('path')
  , util = require('util')
  , tty = require('tty')
  , bufferedSpawn = require('buffered-spawn')
  , promiseFinally = require('promise-finally').default;

/**
 * Representation of a hook runner.
 *
 * @constructor
 * @param {Function} fn Function to be called when we want to exit
 * @param {Object} options Optional configuration, primarily used for testing.
 * @api public
 */
function Hook(fn, options) {
  if (!this) return new Hook(fn, options);
  options = options || {};

  this.options = options;     // Used for testing only. Ignore this. Don't touch.
  this.config = {};           // pre-commit configuration from the `package.json`.
  this.json = {};             // Actual content of the `package.json`.
  this.npm = '';              // The location of the `npm` binary.
  this.git = '';              // The location of the `git` binary.
  this.root = '';             // The root location of the .git folder.
  this.status = '';           // Contents of the `git status`.
  this.exit = fn;             // Exit function.
  this.stashed = false;       // Whether any changes were stashed by pre-commit

  this.initialize();
}

/**
 * Boolean indicating if we're allowed to output progress information into the
 * terminal.
 *
 * @type {Boolean}
 * @public
 */
Object.defineProperty(Hook.prototype, 'silent', {
  get: function silent() {
    return !!this.config.silent;
  }
});

/**
 * Boolean indicating if we're allowed and capable of outputting colors into the
 * terminal.
 *
 * @type {Boolean}
 * @public
 */
Object.defineProperty(Hook.prototype, 'colors', {
  get: function colors() {
    return this.config.colors !== false && tty.isatty(process.stdout.fd);
  }
});

/**
 * Execute a binary.
 *
 * @param {String} bin Binary that needs to be executed
 * @param {Array} args Arguments for the binary
 * @returns {Object}
 * @api private
 */
Hook.prototype.exec = function exec(bin, args) {
  return spawn.sync(bin, args, {
    stdio: 'pipe'
  });
};

/**
 * Parse the package.json so we can create an normalize it's contents to
 * a usable configuration structure.
 *
 * @api private
 */
Hook.prototype.parse = function parse() {
  var pre = this.json['pre-commit'] || this.json.precommit
    , config = !Array.isArray(pre) && 'object' === typeof pre ? pre : {};

  ['silent', 'colors', 'template', 'stash'].forEach(function each(flag) {
    var value;

    if (flag in config) value = config[flag];
    else if ('precommit.'+ flag in this.json) value = this.json['precommit.'+ flag];
    else if ('pre-commit.'+ flag in this.json) value = this.json['pre-commit.'+ flag];
    else return;

    config[flag] = value;
  }, this);

  //
  // The scripts we need to run can be set under the `run` property.
  //
  config.run = config.run || pre;

  if ('string' === typeof config.run) config.run = config.run.split(/[, ]+/);
  if (
       !Array.isArray(config.run)
    && this.json.scripts
    && this.json.scripts.test
    && this.json.scripts.test !== 'echo "Error: no test specified" && exit 1'
  ) {
    config.run = ['test'];
  }

  this.config = config;
};

/**
 * Write messages to the terminal, for feedback purposes.
 *
 * @param {string|Array<string>} lines The messages that need to be written.
 * @param {?function(string)} dest Function to which lines will be written.
 * (default: console.error)
 * @returns {Array<string>} Lines written to output.
 * @api public
 */
Hook.prototype.logOnly = function logOnly(lines, dest) {
  dest = dest || console.error;
  if (!Array.isArray(lines)) lines = lines.split('\n');
  else lines = lines.slice();

  var prefix = this.colors
  ? '\u001b[38;5;166mpre-commit:\u001b[39;49m '
  : 'pre-commit: ';

  lines.push('');     // Whitespace at the end of the log.
  lines.unshift('');  // Whitespace at the beginning.

  lines = lines.map(function map(line) {
    return prefix + line;
  });

  if (!this.silent) lines.forEach(function output(line) {
    // Note:  This wrapper function is necessary to avoid extra args to output.
    dest(line);
  });

  return lines;
};

/**
 * Write messages to the terminal, for feedback purposes, then call exit.
 *
 * @param {string|Array<string>} lines The messages that need to be written.
 * @param {number} exit Exit code for the process.exit.
 * @api public
 */
Hook.prototype.log = function log(lines, exit) {
  if ('number' !== typeof exit) exit = 1;

  var outputLines = this.logOnly(lines, exit ? console.error : console.log);
  this.exit(exit, outputLines);
  return exit === 0;
};

/**
 * Initialize all the values of the constructor to see if we can run as an
 * pre-commit hook.
 *
 * @api private
 */
Hook.prototype.initialize = function initialize() {
  ['git', 'npm'].forEach(function each(binary) {
    try { this[binary] = which.sync(binary); }
    catch (e) {}
  }, this);

  //
  // in GUI clients node and npm are not in the PATH so get node binary PATH,
  // add it to the PATH list and try again.
  //
  if (!this.npm) {
    try {
      process.env.PATH += path.delimiter + path.dirname(process.env._);
      this.npm = which.sync('npm');
    } catch (e) {
      return this.log(this.format(Hook.log.binary, 'npm'), 0);
    }
  }

  //
  // Also bail out if we cannot find the git binary.
  //
  if (!this.git) return this.log(this.format(Hook.log.binary, 'git'), 0);

  this.root = this.exec(this.git, ['rev-parse', '--show-toplevel']);
  this.status = this.exec(this.git, ['status', '--porcelain']);

  if (this.status.code) return this.log(Hook.log.status, 0);
  if (this.root.code) return this.log(Hook.log.root, 0);

  this.status = this.status.stdout.toString().trim();
  this.root = this.root.stdout.toString().trim();

  try {
    this.json = require(path.join(this.root, 'package.json'));
    this.parse();
  } catch (e) { return this.log(this.format(Hook.log.json, e.message), 0); }

  //
  // We can only check for changes after we've parsed the package.json as it
  // contains information if we need to suppress the empty message or not.
  //
  if (!this.status.length && !this.options.ignorestatus) {
    return this.log(Hook.log.empty, 0);
  }

  //
  // If we have a git template we should configure it before checking for
  // scripts so it will still be applied even if we don't have anything to
  // execute.
  //
  if (this.config.template) {
    this.exec(this.git, ['config', 'commit.template', '"'+ this.config.template +'"']);
  }

  if (!this.config.run) return this.log(Hook.log.run, 0);
};

/**
 * Do-nothing function for discarding Promise values.
 *
 * This function is purely for documentation purposes in preventing unwanted
 * Promise values from leaking into an API.
 */
function discardResult(result) {
}

/**
 * Get the hash for a named object (branch, commit, ref, tree, etc.).
 *
 * @param {string} objName Name of object for which to get the hash.
 * @returns {Promise<?string>} SHA1 hash of the named object.  Null if name
 * is not an object.  Error if name could not be determined.
 * @api private
 */
Hook.prototype._getGitHash = function getGitHash(objName) {
  var hooked = this;

  return bufferedSpawn(
    hooked.git,
    ['rev-parse', '--quiet', '--verify', objName],
    {
      cwd: hooked.root,
      stdio: ['ignore', 'pipe', 'ignore']
    }
  )
  .then(
      function (result) {
        return result.stdout;
      },
      function (err) {
        if (err.status === 1) {
          // git rev-parse exits with code 1 if name doesn't exist
          return null;
        }

        return Promise.reject(err);
      }
  );
};

/**
 * Stash changes to working directory.
 *
 * @returns {Promise} Promise which is resolved if stash completes successfully,
 * rejected with an Error if stash can't be run or exits with non-0 exit code.
 * @api private
 */
Hook.prototype._stash = function stash() {
  var hooked = this;
  var stashConfig = hooked.config.stash || {};

  var args = [
    'stash',
    'save',
    '--quiet',
    '--keep-index'
  ];

  if (stashConfig.includeAll) {
    args.push('--all');
  }
  if (stashConfig.includeUntracked) {
    args.push('--include-untracked');
  }

  // name added to aid user in case of unstash failure
  args.push('pre-commit stash');

  return bufferedSpawn(hooked.git, args, {
    cwd: hooked.root,
    stdio: 'inherit'
  })
  .then(discardResult);
};

/**
 * Unstash changes ostensibly stashed by {@link Hook#_stash}.
 *
 * @returns {Promise} Promise which is resolved if stash completes successfully,
 * rejected with an Error if stash can't be run or exits with non-0 exit code.
 * @api private
 */
Hook.prototype._unstash = function unstash() {
  var hooked = this;

  return bufferedSpawn(hooked.git, ['stash', 'pop', '--quiet'], {
    cwd: hooked.root,
    // Note:  This prints 'Already up-to-date!' to stdout if there were no
    // modified files (only untracked files).  Although we could suppress it,
    // the risk of missing a prompt or important output outweighs the benefit.
    // Reported upstream in https://marc.info/?m=145457253905299
    stdio: 'inherit'
  })
  .then(discardResult);
};

/**
 * Clean files in preparation for unstash.
 *
 * @returns {Promise} Promise which is resolved if clean completes successfully,
 * rejected with an Error if clean can't be run or exits with non-0 exit code.
 * @api private
 */
Hook.prototype._clean = function clean() {
  var hooked = this;
  var stashConfig = hooked.config.stash || {};

  var args = ['clean', '-d', '--force', '--quiet'];
  if (stashConfig.includeAll) {
    args.push('-x');
  }
  return bufferedSpawn(hooked.git, args, {
    cwd: hooked.root,
    stdio: 'inherit'
  })
  .then(discardResult);
};

/**
 * Reset files in preparation for unstash.
 *
 * @returns {Promise} Promise which is resolved if reset completes successfully,
 * rejected with an Error if reset can't be run or exits with non-0 exit code.
 * @api private
 */
Hook.prototype._reset = function reset() {
  var hooked = this;

  return bufferedSpawn(hooked.git, ['reset', '--hard', '--quiet'], {
    cwd: hooked.root,
    stdio: 'inherit'
  })
  .then(discardResult);
};

/**
 * Perform setup tasks before running scripts.
 *
 * @returns {Promise} A promise which is resolved when setup is complete.
 * @api private
 */
Hook.prototype._setup = function setup() {
  var hooked = this;

  if (!hooked.config.stash) {
    // No pre-run setup required
    return Promise.resolve();
  }

  // Stash any changes not included in the commit.
  // Based on https://stackoverflow.com/a/20480591
  return hooked._getGitHash('refs/stash')
    .then(function (oldStashHash) {
      return hooked._stash()
        .then(function () {
          return hooked._getGitHash('refs/stash');
        })
        .then(function (newStashHash) {
          hooked.stashed = newStashHash !== oldStashHash;
        });
    });
};

/**
 * Perform cleanup tasks after scripts have run.
 *
 * @returns {Promise} A promise which is resolved when cleanup is complete.
 * The promise is never rejected.  Any failures are logged.
 * @api private
 */
Hook.prototype._cleanup = function cleanup() {
  var hooked = this;
  var stashConfig = hooked.config.stash;

  if (!stashConfig) {
    // No post-run cleanup required
    return Promise.resolve();
  }

  var cleanupResult = Promise.resolve();

  if (stashConfig.reset) {
    cleanupResult = promiseFinally(cleanupResult, function () {
      return hooked._reset();
    });
  }

  if (stashConfig.clean) {
    cleanupResult = promiseFinally(cleanupResult, function () {
      return hooked._clean();
    });
  }

  if (hooked.stashed) {
    cleanupResult = promiseFinally(cleanupResult, function () {
      return hooked._unstash();
    });
  }

  return cleanupResult.then(
    discardResult,
    function (err) {
      hooked.logOnly(hooked.format(Hook.log.unstash, err));
      // Not propagating error.  Cleanup failure shouldn't abort commit.
    }
  );
};

/**
 * Run an npm script.
 *
 * @param {string} script Script name (as in package.json)
 * @returns {Promise} Promise which is resolved if the script completes
 * successfully, rejected with an Error if the script can't be run or exits
 * with non-0 exit code.
 * @api private
 */
Hook.prototype._runScript = function runScript(script) {
  var hooked = this;

  // There's a reason on why we're using an async `spawn` here instead of the
  // `shelljs.exec`. The sync `exec` is a hack that writes writes a file to
  // disk and they poll with sync fs calls to see for results. The problem is
  // that the way they capture the output which us using input redirection and
  // this doesn't have the required `isAtty` information that libraries use to
  // output colors resulting in script output that doesn't have any color.
  //
  return bufferedSpawn(hooked.npm, ['run', script, '--silent'], {
    cwd: hooked.root,
    stdio: 'inherit'
  })
  .catch(function (err) {
    // Add script name to error to simplify error handling
    err.script = script;
    return Promise.reject(err);
  })
  .then(discardResult);
};

/**
 * Run the configured hook scripts.
 *
 * @returns {Promise} Promise which is resolved after all hook scripts have
 * completed.  Promise is rejected with an Error if any script fails.
 * @api private
 */
Hook.prototype._runScripts = function runScripts() {
  var hooked = this;
  var scripts = hooked.config.run;

  return scripts.reduce(function (prev, script) {
    // Each script starts after the previous script succeeds
    return prev.then(function () {
      return hooked._runScript(script);
    });
  }, Promise.resolve())
  .then(discardResult);
};

/**
 * Run the specified hooks.
 *
 * @returns {Promise} Promise which is resolved after setup, all hook scripts,
 * and cleanup have completed.  Promise is rejected with an Error if any script
 * fails.
 * @api public
 */
Hook.prototype.run = function runner() {
  var hooked = this;
  var scripts = hooked.config.run;

  if (!scripts.length) {
    hooked.exit(0);
    return Promise.resolve();
  }

  function setupFailed(err) {
    hooked.log(hooked.format(Hook.log.setup, err), 0);
    return Promise.reject(err);
  }

  function scriptFailed(err) {
    var script = err.script;
    var code = err.status;
    hooked.log(hooked.format(Hook.log.failure, script, code), code);
    return Promise.reject(err);
  }

  function scriptsPassed() {
    hooked.exit(0);
  }

  function setupDone() {
    // Run scripts, then unconditionally run cleanup without changing result
    return promiseFinally(hooked._runScripts(), function () {
      return hooked._cleanup();
    })
    .then(scriptsPassed, scriptFailed);
  }

  var result = hooked._setup().then(setupDone, setupFailed);
  result._mustHandle = true;
  return result;
};

// For API compatibility with previous versions, where asynchronous exceptions
// were always unhandled, if the promise we return results in an unhandled
// rejection, convert that to an exception.
// Note:  If the caller chains anything to it, the new Promise would be
// unhandled if the chain does not include a handler.
process.on('unhandledRejection', function checkMustHandle(reason, p) {
  if (p._mustHandle) {
    throw reason;
  }
});

/**
 * Expose some of our internal tools so plugins can also re-use them for their
 * own processing.
 *
 * @type {Function}
 * @public
 */
Hook.prototype.format = util.format;

/**
 * The various of error and status messages that we can output.
 *
 * @type {Object}
 * @private
 */
Hook.log = {
  binary: [
    'Failed to locate the `%s` binary, make sure it\'s installed in your $PATH.',
    'Skipping the pre-commit hook.'
  ].join('\n'),

  status: [
    'Failed to retrieve the `git status` from the project.',
    'Skipping the pre-commit hook.'
  ].join('\n'),

  setup: [
    'Error preparing repository for pre-commit hook scripts to run: %s',
    'Skipping the pre-commit hook.'
  ].join('\n'),

  root: [
    'Failed to find the root of this git repository, cannot locate the `package.json`.',
    'Skipping the pre-commit hook.'
  ].join('\n'),

  empty: [
    'No changes detected.',
    'Skipping the pre-commit hook.'
  ].join('\n'),

  json: [
    'Received an error while parsing or locating the `package.json` file:',
    '',
    '  %s',
    '',
    'Skipping the pre-commit hook.'
  ].join('\n'),

  unstash: [
    'Unable to reset/clean and re-apply the pre-commit stash: %s',
    '',
    'Please fix any errors printed by git then re-run `git stash pop` to',
    'restore the working directory to its previous state.'
  ].join('\n'),

  run: [
    'We have nothing pre-commit hooks to run. Either you\'re missing the `scripts`',
    'in your `package.json` or have configured pre-commit to run nothing.',
    'Skipping the pre-commit hook.'
  ].join('\n'),

  failure: [
    'We\'ve failed to pass the specified git pre-commit hooks as the `%s`',
    'hook returned an exit code (%d). If you\'re feeling adventurous you can',
    'skip the git pre-commit hooks by adding the following flags to your commit:',
    '',
    '  git commit -n (or --no-verify)',
    '',
    'This is ill-advised since the commit is broken.'
  ].join('\n')
};

//
// Expose the Hook instance so we can use it for testing purposes.
//
module.exports = Hook;

//
// Run directly if we're required executed directly through the CLI
//
if (module !== require.main) return;

var hook = new Hook(function cli(code) {
  process.exit(code);
});

hook.run();
