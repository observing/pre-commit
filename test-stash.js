/* istanbul ignore next */
'use strict';

/* These tests are split out into a separate file primarily to avoid running
 * them on every commit (which is slow).
 */

var Hook = require('./')
  , assume = require('assume')
  , buffSpawn = require('buffered-spawn')
  , fs = require('fs')
  , path = require('path')
  , pify = require('pify')
  , rimraf = require('rimraf')
  , which = require('which');

/** Path to repository in which tests are run. */
var TEST_REPO_PATH = path.join(__dirname, 'test-repo');

/** Name of a test file which is ignored by git. */
var IGNORED_FILE_NAME = 'ignored.txt';

/** Name of an empty file committed to the git repository. */
var TRACKED_FILE_NAME = 'tracked.txt';

/** Name of a file which is not committed or ignored by git. */
var UNTRACKED_FILE_NAME = 'untracked.txt';

/** Content which is written to files by scripts. */
var SCRIPT_CONTENT = 'script-modified';
var SCRIPT_CONTENT_BUFF = new Buffer(SCRIPT_CONTENT + '\n');

/** Content which is written to files by tests. */
var TEST_CONTENT = 'test-modified';
var TEST_CONTENT_BUFF = new Buffer(TEST_CONTENT + '\n');

/** Content for package.json in the test repository. */
var PACKAGE_JSON = {
  name: 'pre-commit-test',
  scripts: {
    'modify-ignored': 'echo ' + SCRIPT_CONTENT + ' > ' + IGNORED_FILE_NAME,
    'modify-tracked': 'echo ' + SCRIPT_CONTENT + ' > ' + TRACKED_FILE_NAME,
    'modify-untracked': 'echo ' + SCRIPT_CONTENT + ' > ' + UNTRACKED_FILE_NAME,
    'test': 'exit 0',
    'test-ignored-exists': 'test -e ' + IGNORED_FILE_NAME,
    'test-tracked-empty': 'test ! -s ' + TRACKED_FILE_NAME,
    'test-untracked-exists': 'test -e ' + UNTRACKED_FILE_NAME
  }
};

// Global variables
var gitPath
  , readFileP = pify(fs.readFile)
  , rimrafP = pify(rimraf)
  , statP = pify(fs.stat)
  , whichP = pify(which)
  , writeFileP = pify(fs.writeFile);

/**
 * Find git in $PATH and set gitPath global.
 * @returns {Promise} Promise with the path to git.
 */
function findGit() {
  return whichP('git').then(function (whichGit) {
    gitPath = whichGit;
    return whichGit;
  });
}

/**
 * Run git with given arguments and options.
 * @returns {Promise} Promise with the process output or Error for non-0 exit.
 */
function git(/* [args...], [options] */) {
  if (!gitPath) {
    var origArgs = arguments;
    return findGit().then(function () {
      return git.apply(null, origArgs);
    });
  }

  // Default to redirecting stdin (to prevent unexpected prompts) and
  // including any output with test output
  var defaultStdio = ['ignore', process.stdout, process.stderr];

  var args, options;
  if ('object' === typeof arguments[arguments.length - 1]) {
    args = Array.prototype.slice.call(arguments);
    options = args.pop();
    options.stdio = options.stdio || defaultStdio;
  } else {
    // Note:  spawn/buffSpawn requires Array type for arguments
    args = Array.prototype.slice.call(arguments);
    options = {
      stdio: defaultStdio
    };
  }

  return buffSpawn(gitPath, args, options);
}

/** Create a stash and return its hash. */
function createStash() {
  // Modify a tracked file to ensure a stash is created.
  return writeFileP(TRACKED_FILE_NAME, TEST_CONTENT_BUFF)
    .then(function gitStash() {
      return git('stash', 'save', '-q', 'test stash');
    })
    .then(function gitRevParse() {
      var options = { stdio: ['ignore', 'pipe', process.stderr] };
      return git('rev-parse', '-q', '--verify', 'refs/stash', options);
    })
    .then(function getOutput(result) {
      return result.stdout;
    });
}

/** Throw a given value. */
function throwIt(err) {
  throw err;
}

describe('pre-commit stash support', function () {
  var origCWD;

  before('test for unhandledRejection', function () {
    // We want to ensure that all Promises are handled.
    // Since Mocha does not watch for unhandledRejection, convert
    // unhandledRejection to uncaughtException by throwing it.
    // See: https://github.com/mochajs/mocha/issues/1926
    process.on('unhandledRejection', throwIt);
  });

  after('stop testing for unhandledRejection', function () {
    // Limit the unhandledRejection guarantee to this spec
    process.removeListener('unhandledRejection', throwIt);
  });

  before('setup test repository', function () {
    return rimrafP(TEST_REPO_PATH)
      .then(function createTestRepo() {
        return git('init', '-q', TEST_REPO_PATH);
      })
      // The user name and email must be configured for the later git commands
      // to work.  On Travis CI (and probably others) there is no global config
      .then(function getConfigName() {
        return git('-C', TEST_REPO_PATH,
            'config', 'user.name', 'Test User');
      })
      .then(function getConfigEmail() {
        return git('-C', TEST_REPO_PATH,
            'config', 'user.email', 'test@example.com');
      })
      .then(function createFiles() {
        return Promise.all([
          writeFileP(
            path.join(TEST_REPO_PATH, '.gitignore'),
            IGNORED_FILE_NAME + '\n'
          ),
          writeFileP(
            path.join(TEST_REPO_PATH, 'package.json'),
            JSON.stringify(PACKAGE_JSON, null, 2)
          ),
          writeFileP(
            path.join(TEST_REPO_PATH, TRACKED_FILE_NAME),
            new Buffer(0)
          )
        ]);
      })
      .then(function addFiles() {
        return git('-C', TEST_REPO_PATH, 'add', '.');
      })
      .then(function createCommit() {
        return git('-C', TEST_REPO_PATH,
            'commit', '-q', '-m', 'Initial Commit');
      });
  });

  after('remove test repository', function () {
    return rimrafP(TEST_REPO_PATH);
  });

  before('run from test repository', function () {
    origCWD = process.cwd();
    process.chdir(TEST_REPO_PATH);
  });

  after('restore original working directory', function () {
    process.chdir(origCWD);
  });

  beforeEach('cleanup test repository', function () {
    // Ensure the test repository is in a pristine state
    return git('-C', TEST_REPO_PATH, 'reset', '-q', '--hard')
      .then(function clean() {
        return git('clean', '-qdxf');
      })
      .then(function clearStash() {
        return git('stash', 'clear');
      });
  });

  it('should not stash by default', function () {
    return writeFileP(TRACKED_FILE_NAME, TEST_CONTENT_BUFF)
      .then(function doHook() {
        var hook = new Hook(function () {}, { ignorestatus: true });
        hook.config.run = ['test-tracked-empty'];
        return hook.run();
      })
      .then(
        function () { throw new Error('Expected script error'); },
        function (err) { assume(err.script).equals('test-tracked-empty'); }
      );
  });

  it('should not stash without scripts to run', function () {
    return writeFileP(UNTRACKED_FILE_NAME, TEST_CONTENT_BUFF)
      .then(function doHook() {
        var hook = new Hook(function () {}, { ignorestatus: true });
        hook.config.run = [];
        hook.config.stash = {
          clean: true,
          includeUntracked: true
        };
        return hook.run();
      })
      .then(function readUntracked() {
        return readFileP(UNTRACKED_FILE_NAME);
      })
      .then(function checkContent(content) {
        assume(content).eql(TEST_CONTENT_BUFF);
      });
  });

  it('should stash and restore modified files', function () {
    return writeFileP(TRACKED_FILE_NAME, TEST_CONTENT_BUFF)
      .then(function doHook() {
        var hook = new Hook(function () {}, { ignorestatus: true });
        hook.config.run = ['test-tracked-empty'];
        hook.config.stash = true;
        return hook.run();
      })
      .then(function readTracked() {
        return readFileP(TRACKED_FILE_NAME);
      })
      .then(function checkContent(content) {
        assume(content).eql(TEST_CONTENT_BUFF);
      });
  });

  it('should stash and restore modified files on script error', function () {
    return writeFileP(TRACKED_FILE_NAME, TEST_CONTENT_BUFF)
      .then(function doHook() {
        var hook = new Hook(function () {}, { ignorestatus: true });
        hook.config.run = ['test-untracked-exists'];
        hook.config.stash = true;
        return hook.run();
      })
      .catch(function checkError(err) {
        assume(err.script).eql('test-untracked-exists');
      })
      .then(function readTracked() {
        return readFileP(TRACKED_FILE_NAME);
      })
      .then(function checkContent(content) {
        assume(content).eql(TEST_CONTENT_BUFF);
      });
  });

  // Since a stash is not created if there are no changes, this check is
  // necessary.
  it('should not touch the existing stash', function () {
    return createStash()
      .then(function hookAndCheck(oldHash) {
        assume(oldHash).is.not.falsey();

        var hook = new Hook(function () {}, { ignorestatus: true });
        hook.config.run = ['test-tracked-empty'];
        hook.config.stash = true;
        return hook.run()
          .then(function getStashHash() {
            return hook._getGitHash('refs/stash');
          })
          .then(function checkStashHash(newHash) {
            assume(newHash).equals(oldHash);
          });
      });
  });

  it('should not stash untracked files by default', function () {
    return writeFileP(UNTRACKED_FILE_NAME, TEST_CONTENT_BUFF)
      .then(function doHook() {
        var hook = new Hook(function () {}, { ignorestatus: true });
        hook.config.run = ['test-untracked-exists'];
        hook.config.stash = true;
        return hook.run();
      });
  });

  it('can stash and restore untracked files', function () {
    return writeFileP(UNTRACKED_FILE_NAME, TEST_CONTENT_BUFF)
      .then(function doHook() {
        var hook = new Hook(function () {}, { ignorestatus: true });
        hook.config.run = ['test-untracked-exists'];
        hook.config.stash = {
          includeUntracked: true
        };
        return hook.run();
      })
      .catch(function checkError(err) {
        assume(err.script).eql('test-untracked-exists');
      })
      .then(function readUntracked() {
        return readFileP(UNTRACKED_FILE_NAME);
      })
      .then(function checkContent(content) {
        assume(content).eql(TEST_CONTENT_BUFF);
      });
  });

  it('should not stash ignored files by default', function () {
    return writeFileP(IGNORED_FILE_NAME, TEST_CONTENT_BUFF)
      .then(function doHook() {
        var hook = new Hook(function () {}, { ignorestatus: true });
        hook.config.run = ['test-ignored-exists'];
        hook.config.stash = true;
        return hook.run();
      });
  });

  it('can stash and restore ignored files', function () {
    return writeFileP(IGNORED_FILE_NAME, TEST_CONTENT_BUFF)
      .then(function doHook() {
        var hook = new Hook(function () {}, { ignorestatus: true });
        hook.config.run = ['test-ignored-exists'];
        hook.config.stash = {
          includeAll: true
        };
        return hook.run();
      })
      .catch(function checkError(err) {
        assume(err.script).eql('test-ignored-exists');
      })
      .then(function readIgnored() {
        return readFileP(IGNORED_FILE_NAME);
      })
      .then(function checkContent(content) {
        assume(content).eql(TEST_CONTENT_BUFF);
      });
  });

  it('should not clean by default', function () {
    var hook = new Hook(function () {}, { ignorestatus: true });
    hook.config.run = ['modify-untracked'];
    hook.config.stash = true;
    return hook.run()
      .then(function readUntracked() {
        return readFileP(UNTRACKED_FILE_NAME);
      })
      .then(function checkContent(content) {
        assume(content).eql(SCRIPT_CONTENT_BUFF);
      });
  });

  it('can clean', function () {
    var hook = new Hook(function () {}, { ignorestatus: true });
    hook.config.run = ['modify-untracked'];
    hook.config.stash = {
      clean: true
    };
    return hook.run()
      .then(function readUntracked() {
        return statP(UNTRACKED_FILE_NAME);
      })
      .then(
        function () {
          throw new Error('Expected ' + UNTRACKED_FILE_NAME +
              ' to be cleaned');
        },
        function (err) {
          assume(err.code).equals('ENOENT');
        }
      );
  });

  it('should not clean ignored files by default', function () {
    var hook = new Hook(function () {}, { ignorestatus: true });
    hook.config.run = ['modify-ignored'];
    hook.config.stash = {
      clean: true
    };
    return hook.run()
      .then(function readIgnored() {
        return readFileP(IGNORED_FILE_NAME);
      })
      .then(function checkContent(content) {
        assume(content).eql(SCRIPT_CONTENT_BUFF);
      });
  });

  it('can clean ignored files', function () {
    var hook = new Hook(function () {}, { ignorestatus: true });
    hook.config.run = ['modify-ignored'];
    hook.config.stash = {
      includeAll: true,
      clean: true
    };
    return hook.run()
      .then(function readIgnored() {
        return statP(IGNORED_FILE_NAME);
      })
      .then(
        function () {
          throw new Error('Expected ' + IGNORED_FILE_NAME +
              ' to be cleaned');
        },
        function (err) {
          assume(err.code).equals('ENOENT');
        }
      );
  });

  it('should not reset modified files by default', function () {
    var hook = new Hook(function () {}, { ignorestatus: true });
    hook.config.run = ['modify-tracked'];
    hook.config.stash = true;
    return hook.run()
      .then(function readTracked() {
        return readFileP(TRACKED_FILE_NAME);
      })
      .then(function checkContent(content) {
        assume(content).eql(SCRIPT_CONTENT_BUFF);
      });
  });

  it('can reset modified files', function () {
    var hook = new Hook(function () {}, { ignorestatus: true });
    hook.config.run = ['modify-tracked'];
    hook.config.stash = {
      reset: true
    };
    return hook.run()
      .then(function readTracked() {
        return readFileP(TRACKED_FILE_NAME);
      })
      .then(function checkContent(content) {
        assume(content).eql(new Buffer(0));
      });
  });
});
