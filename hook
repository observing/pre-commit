#!/usr/bin/env node

'use strict';

var child = require('child_process');

//
// Get the root of the repository.
//
child.exec('git status --porcelain', function chagnes(err, status) {
  if (err) {
    console.error('pre-commit: Failed to find git root. Cannot run the tests.');
    return process.exit(1);
  }

  if (!status.trim().length) {
    console.log('');
    console.log('pre-commit: No changes detected, bailing out.');
    console.log('');
    return;
  }

  child.exec('git rev-parse --show-toplevel', run);
});

/**
 * You've failed on some of the scripts, output how much you've sucked today.
 *
 * @param {Error} err The actual error.
 * @api private
 */
function failure(err) {
  console.error('');
  console.error('pre-commit: You\'ve failed to pass all the hooks.');
  console.error('pre-commit:');

  if (err.ran) {
    console.error('pre-commit: The "npm run '+ err.ran +'" script failed.');
  } else {
    var stack = err.stack.split('\n')
    console.error('pre-commit: An Error was thrown: '+ stack.shift());
    console.error('pre-commit:');
    stack.forEach(function trace(line) {
      console.error('pre-commit:   '+ line.trim());
    });
  }
  console.error('pre-commit:');
  console.error('pre-commit: You can skip the git pre-commit hook by running:');
  console.error('pre-commit:');
  console.error('pre-commit:   git commit -n (--no-verify)');
  console.error('pre-commit:');
  console.error('pre-commit: But this is not adviced as your tests are obviously failing.');
  console.error('');
  process.exit(1);
}

/**
 * Run the set pre-commit hooks.
 *
 * @param {Error} err The error that happend while executing the command.
 * @param {Error} output The output of rev-parse.
 * @api private
 */
function run(err, output) {
  if (err) {
    console.error('');
    console.error('pre-commit: Failed to find git root. Cannot run the tests.');
    console.error('');
    return process.exit(1);
  }

  //
  // Check if there are scripts specified that we need to run.
  //
  var root = output.trim()
    , run = []
    , pkg;

  //
  // Bail-out when we failed to parse the package.json, there is probably a some
  // funcky chars in there.
  //
  try { pkg = require(root +'/package.json'); }
  catch (e) { return failure(e); }

  if (!pkg.scripts) {
    console.log('');
    console.log('pre-commit: No scripts detected in the package.json, bailing out.');
    console.log('');
    return;
  }

  //
  // If there's a `pre-commit` property in the package.json we should use that
  // array.
  //
  if (pkg['pre-commit'] && Array.isArray(pkg['pre-commit'])) run = pkg['pre-commit'];

  //
  // If we don't have any run processes to run try to see if there's a `test`
  // property which we should run instead. But we should check if it's not the
  // default value that `npm` adds when your run the `npm init` command.
  //
  if (
       !run.length
    && pkg.scripts.test
    && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1'
  ) {
    run.push('test');
  }

  //
  // Bailout if we don't have anything to run.
  //
  if (!run.length) {
    console.log('');
    console.log('pre-commit: Nothing to run. Bailing out.');
    console.log('');
    return;
  }

  //
  // Behold, a lazy man's async flow control library;
  //
  (function runner(done) {
    (function next(err, task) {
      //
      // Bailout when we received an error. This will make sure that we don't
      // run the rest of the tasks.
      //
      if (err) {
        err = new Error(err.message);
        err.ran = task;
        return done(err);
      }

      // Check if we have tasks to be executed or if we are complete.
      task = run.shift();
      if (!task) return done();

      var npm = child.spawn('npm', ['run', task], {
        cwd: root,            // Make sure that we spawn it in the root of repo.
        env: process.env,     // Give them the same ENV variables.
        stdio: [0, 1, 2]      // Pipe all the things.
      });

      //
      // Check the close code to see if we passed or failed.
      //
      npm.on('close', function close(code) {
        if (code !== 0) return next(new Error(task +' closed with code '+ code), task);

        next(undefined, task);
      });
    })();
  })(function ready(err) {
    if (err) return failure(err);

    //
    // Congratulation young padawan, all hooks passed.
    //
    process.exit(0);
  });
}
