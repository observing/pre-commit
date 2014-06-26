'use strict';

var path = require('path')
  , fs = require('fs');

//
// Compatibility with older node.js.
//
var existsSync = fs.existsSync || path.existsSync;

//
// The location of the pre-commit hook.
//
var precommit = path.resolve(__dirname, '../..', '.git', 'hooks', 'pre-commit');

//
// Bail out if we don't have pre-commit file, it might be removed manually.
//
if (!existsSync(precommit)) return;

//
// If we don't have an old file, we should just remove the pre-commit hook. But
// if we do have an old precommit file we want to restore that.
//
if (!existsSync(precommit +'.old')) {
  fs.unlinkSync(precommit);
} else {
  fs.writeFileSync(precommit, fs.readFileSync(precommit +'.old'));
  fs.chmodSync(precommit, '755');
  fs.unlinkSync(precommit +'.old');
}
