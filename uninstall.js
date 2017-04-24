'use strict';

var fs = require('fs')
  , path = require('path')
  , execSync = require('child_process').execSync
  , exists = fs.existsSync || path.existsSync
  , root = path.resolve(__dirname, '..', '..')
  , config = execSync('git rev-parse --git-dir', { cwd: root }).toString().trim()
  , precommit = path.resolve(root, config, 'hooks', 'pre-commit');

//
// Bail out if we don't have pre-commit file, it might be removed manually.
//
if (!exists(precommit)) return;

fs.unlinkSync(precommit);

//
// If we don't have an old file, we should just remove the pre-commit hook. But
// if we do have an old precommit file we want to restore that.
//
if (exists(precommit +'.old')) {
  fs.writeFileSync(precommit, fs.readFileSync(precommit +'.old'));
  fs.chmodSync(precommit, '755');
  fs.unlinkSync(precommit +'.old');
}
