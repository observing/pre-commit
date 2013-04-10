#!/usr/bin/env node

'use strict';

var child = require('child_process');

//
// Get the root of the repository
//
child.exec('git rev-parse --show-toplevel', function rev(err, output) {
  if (err) {
    console.error('pre-commit: Failed to find git root. Cannot run the tests.');
    return process.exit(1);
  }

  //
  // Check if there are scripts specified that we need to run.
  //
  var root = output.trim()
    , pkg = require(root +'/package.json')
    , run = [];

  if (!pkg.scripts) return console.log('pre-commit: No scripts detected in the package.json, bailing out');

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
    && pkg.script.test !== 'echo "Error: no test specified" && exit 1'
  ) {
    run.push('test');
  }

  //
  // Bailout if we don't have anything to run.
  //
  if (!run.length) return console.log('pre-commit: Nothing to run. Bailing out');

  //
  // Behold, a lazy man's async flow control library;
  //
  (function runner(done) {
    (function next(task, err, stdout, stderr) {
      //
      // Output results if they are available, this needs to be done before the
      // err check as successful tasks can also output useful information.
      //
      if (stdout && stdout.length) {
        console.log('pre-commit: Received std-out for the "%s" task', task);
        console.log(stdout);
      }

      if (stderr && stderr.length) {
        console.error('pre-commit: Received std-err for the "%s" task', task);
        console.error(stderr);
      }

      //
      // Bailout when we received an error. This will make sure that we don't
      // run the rest of the tasks.
      //
      if (err) {
        err = new Error(err.message);
        err.ran = task;
        return done(err);
      }

      // Check if we have tasks to be executed or if we are complete
      task = run.shift();
      if (!task) return done();

      child.exec('npm run '+ task, { cwd: root }, next.bind(next, task));
    })();
  })(function ready(err) {
    //
    // You've failed on some of the scripts, output how much you've sucked
    // today.
    //
    if (err) {
      console.error('');
      console.error('pre-commit: You\'ve failed to pass all the hooks');
      console.error('pre-commit: The '+ err.ran +' hook failed');
      console.error('');
      process.exit(1);
    }

    //
    // Congratulation young padawan, all hooks passed.
    //
    process.exit(0);
  });
});
