'use strict';

var path = require('path')
  , fs = require('fs');

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
if (!fs.existsSync(git) || !fs.lstatSync(git).isDirectory()) return;

//
// Create a hooks directory if it's missing.
//
if (!fs.existsSync(hooks)) fs.mkdirSync(hooks);

//
// If there's an existing `pre-commit` hook we want to back it up instead of
// overriding it and losing it completely
//
if (fs.existsSync(precommit)) {
  console.log('pre-commit: Detected an existing git pre-commit hook');
  fs.writeFileSync(precommit +'.old', fs.readFileSync(precommit));
  console.log('pre-commit: Old pre-commit hook backuped to pre-commit.old');
}

//
// Everything is ready for the installation of the pre-commit hook. Write it and
// make it executable.
//
fs.writeFileSync(precommit, hook);
fs.chmodSync(precommit, '755');
