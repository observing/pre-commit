'use strict';

var path = require('path')
  , fs = require('fs');

//
// Compatibility with older node.js.
//
var existsSync = fs.existsSync || path.existsSync;

//
// Our own pre-commit hook runner.
//
var hook = fs.readFileSync('./hook');

//
// The root of repository.
//
var root = path.resolve(__dirname, '../..');

//
// The location .git and it's hooks
//
var git = path.resolve(root, '.git')
  , hooks = path.resolve(git, 'hooks')
  , precommit = path.resolve(hooks, 'pre-commit');

//
// Check if we are in a git repository so we can bail out early when this is not
// the case.
//
if (!existsSync(git) || !fs.lstatSync(git).isDirectory()) return;

//
// Create a hooks directory if it's missing.
//
if (!existsSync(hooks)) fs.mkdirSync(hooks);

//
// If there's an existing `pre-commit` hook we want to back it up instead of
// overriding it and losing it completely
//
if (
     existsSync(precommit)
  && fs.readFileSync(precommit).toString('utf8') !== hook.toString('utf8')
) {
  console.log('');
  console.log('pre-commit: Detected an existing git pre-commit hook');
  fs.writeFileSync(precommit +'.old', fs.readFileSync(precommit));
  console.log('pre-commit: Old pre-commit hook backuped to pre-commit.old');
  console.log('');
}

//
// Everything is ready for the installation of the pre-commit hook. Write it and
// make it executable.
//
fs.writeFileSync(precommit, hook);
fs.chmodSync(precommit, '755');
