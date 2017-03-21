'use strict';

var fs = require('fs')
  , path = require('path')
  , exists = fs.existsSync || path.existsSync
  , root = path.resolve(__dirname, '..', '..')
  , git = path.resolve(root, '.git')
  , hooks = path.resolve(git, 'hooks')
  , precommit = path.resolve(hooks, 'pre-commit');

// If the .git is a file it is probably a submodule
if (fs.lstatSync(git).isFile()) {
  // the .git file should contain "gitdir: ../.git/modules/path" if we use submodules
  var fileContents = fs.readFileSync(git, 'utf8');
  if (fileContents.match(/^gitdir:/)) {
    git = path.resolve(root, fileContents.replace(/gitdir: /, '').replace(/^\s+|\s+$/g, ''));
    hooks = path.resolve(git, 'hooks');
    precommit = path.resolve(hooks, 'pre-commit');
  }
}

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
