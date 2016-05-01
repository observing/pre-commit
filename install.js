'use strict';

//
// Compatibility with older node.js as path.exists got moved to `fs`.
//
var fs = require('fs')
  , path = require('path')
  , spawn = require('cross-spawn')
  , hook = path.join(__dirname, 'hook')
  , root = path.resolve(__dirname, '..', '..')
  , util = require('util')
  , exists = fs.existsSync || path.existsSync;

//
// Gather the location of the possible hidden .git directory, the hooks
// directory which contains all git hooks and the absolute location of the
// `pre-commit` file. The path needs to be absolute in order for the symlinking
// to work correctly.
//
var git = path.resolve(root, '.git')
  , hooks = path.resolve(git, 'hooks')
  , precommit = path.resolve(hooks, 'pre-commit');

//
// Bail out if we don't have an `.git` directory as the hooks will not get
// triggered. If we do have directory create a hooks folder if it doesn't exist.
//
if (!exists(git) || !fs.lstatSync(git).isDirectory()) return;
if (!exists(hooks)) fs.mkdirSync(hooks);

//
// If there's an existing `pre-commit` hook we want to back it up instead of
// overriding it and losing it completely as it might contain something
// important.
//
if (exists(precommit) && !fs.lstatSync(precommit).isSymbolicLink()) {
  console.log('pre-commit:');
  console.log('pre-commit: Detected an existing git pre-commit hook');
  fs.writeFileSync(precommit +'.old', fs.readFileSync(precommit));
  console.log('pre-commit: Old pre-commit hook backuped to pre-commit.old');
  console.log('pre-commit:');
}

//
// We cannot create a symlink over an existing file so make sure it's gone and
// finish the installation process.
//
try { fs.unlinkSync(precommit); }
catch (e) {}

// https://gist.github.com/coolaj86/992478#file-fs-extra-js-L14
fs.copy = function (src, dst, cb) {
  function copy(err) {
    var is
      , os
      ;

    if (!err) {
      return cb(new Error("File " + dst + " exists."));
    }

    fs.stat(src, function (err) {
      if (err) {
        return cb(err);
      }
      is = fs.createReadStream(src);
      os = fs.createWriteStream(dst);
      util.pump(is, os, cb);
    });
  }

  fs.stat(dst, copy);
};


//
// It could be that we do not have rights to this folder which could cause the
// installation of this module to completely fail. We should just output the
// error instead destroying the whole npm install process.
//
var operation = 'symlink';
try {
  if (process.platform === 'win32') {
    fs.copy(path.relative(hooks, hook), precommit);
    operation = 'copy';
  } else {
    fs.symlinkSync(path.relative(hooks, hook), precommit, 'file');
  }
}
catch (e) {
  console.error('pre-commit:');
  console.error('pre-commit: Failed to ' + operation + ' the hook file in your .git/hooks folder because:');
  console.error('pre-commit: '+ e.message);
  console.error('pre-commit: The hook was not installed.');
  console.error('pre-commit:');
}
