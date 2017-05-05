'use strict';

var fs = require('fs')
  , path = require('path')
  , exists = fs.existsSync || path.existsSync
  , root = path.resolve(__dirname, '..', '..')
  , git = path.resolve(root, '.git');

//
// Resolve git directory for submodules
//
if (exists(git) && fs.lstatSync(git).isFile()) {
  var gitinfo = fs.readFileSync(git).toString()
    , gitdirmatch = /gitdir: (.+)/.exec(gitinfo)
    , gitdir = gitdirmatch.length == 2 ? gitdirmatch[1] : null;

  if (gitdir !== null) {
    git = path.resolve(root, gitdir);
  }
}

//
// Location of pre-commit hook, if it exists
//
var precommit = path.resolve(git, 'hooks', 'pre-commit');

//
// Bail out if we don't have pre-commit file, it might be removed manually.
//
if (!exists(precommit)) return;

//
// If we don't have an old file, we should just remove the pre-commit hook. But
// if we do have an old precommit file we want to restore that.
//
if (!exists(precommit +'.old')) {
  fs.unlinkSync(precommit);
} else {
  fs.writeFileSync(precommit, fs.readFileSync(precommit +'.old'));
  fs.chmodSync(precommit, '755');
  fs.unlinkSync(precommit +'.old');
}
