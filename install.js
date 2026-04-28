'use strict';

//
// Compatibility with older node.js as path.exists got moved to `fs`.
//
var fs = require('fs')
  , path = require('path')
  , os = require('os')
  , hook = path.join(__dirname, 'hook')
  , hookAbs = path.resolve(hook)
  , root = path.resolve(__dirname, '..', '..')
  , exists = fs.existsSync || path.existsSync;

//
// POSIX single-quoted string for embedding paths in generated shell scripts.
//
function shellSingleQuote(str) {
  return '\'' + str.replace(/'/g, '\'\\\'\'') + '\'';
}

//
// Gather the location of the possible hidden .git directory, the hooks
// directory which contains all git hooks and the absolute location of the
// `pre-commit` file. The path needs to be absolute in order for the symlinking
// to work correctly.
//

var git = getGitFolderPath(root);

//
// Walk up from `currentPath` looking for `.git`. Returns the path to the `.git`
// entry as soon as one is found, regardless of whether it is a directory (the
// regular case) or a file (submodules, linked worktrees, where `.git` contains
// `gitdir: <path>`).
//
function getGitFolderPath(currentPath) {
  var git = path.resolve(currentPath, '.git');

  if (exists(git)) {
    var stat = fs.lstatSync(git);
    if (stat.isDirectory() || stat.isFile()) {
      console.log('pre-commit:');
      console.log('pre-commit: Found .git in', git);
      return git;
    }
  }

  console.log('pre-commit:');
  console.log('pre-commit: No .git found in', currentPath);

  var newPath = path.resolve(currentPath, '..');
  if (currentPath === newPath) return null;

  return getGitFolderPath(newPath);
}

//
// When `.git` is a file (submodules and linked worktrees) it contains a
// `gitdir: <path>` pointer to the real git directory. Paths inside that file
// are resolved relative to the directory containing the `.git` file, not
// relative to the package root, so we use `path.dirname(git)` as the base.
//
if (git && fs.lstatSync(git).isFile()) {
  var gitinfo = fs.readFileSync(git, 'utf8')
    , gitdirmatch = /^gitdir:\s*(.+)$/m.exec(gitinfo)
    , gitdir = gitdirmatch ? gitdirmatch[1].trim() : null;

  if (gitdir) {
    git = path.resolve(path.dirname(git), gitdir);
  } else {
    console.log('pre-commit:');
    console.log('pre-commit: .git file did not contain a gitdir pointer; aborting.');
    return;
  }
}

//
// Bail out if we don't have an `.git` directory as the hooks will not get
// triggered. If we do have directory create a hooks folder if it doesn't exist.
//
if (!git) {
  console.log('pre-commit:');
  console.log('pre-commit: Not found any .git folder for installing pre-commit hook');
  return;
}

var hooks = path.resolve(git, 'hooks')
  , precommit = path.resolve(hooks, 'pre-commit');

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
  console.log('pre-commit: Old pre-commit hook backed up to pre-commit.old');
  console.log('pre-commit:');
}

//
// We cannot create a symlink over an existing file so make sure it's gone and
// finish the installation process.
//
try { fs.unlinkSync(precommit); }
catch (e) {}

// Delegate to this package's `hook` script using an absolute path so Yarn Plug'n'Play
// and other layouts without `node_modules/pre-commit` still work. The hook script
// changes to the git root before resolving `pre-commit` via Node.
//
var hookLauncher = hookAbs;
if (os.platform() === 'win32') {
  hookLauncher = hookLauncher.replace(/\\/g, '/');
}

//
// Generated wrapper:
//   * Unsets GIT_LITERAL_PATHSPECS so hooks invoked from magit/emacs behave the
//     same as on the command line. See:
//     https://magit.vc/manual/magit/My-Git-hooks-work-on-the-command_002dline-but-not-inside-Magit.html
//   * If the package's `hook` script is missing (e.g. user switched to a branch
//     without `node_modules`, or removed the `pre-commit` package), skip
//     silently with exit 0 so commits are not blocked.
//
var precommitContent = [
  '#!/usr/bin/env bash',
  'unset GIT_LITERAL_PATHSPECS',
  'HOOK=' + shellSingleQuote(hookLauncher),
  'if [ ! -f "$HOOK" ]; then',
  '  exit 0',
  'fi',
  'exec bash "$HOOK" "$@"',
  ''
].join(os.EOL);

//
// It could be that we do not have rights to this folder which could cause the
// installation of this module to completely fail. We should just output the
// error instead destroying the whole npm install process.
//
try { fs.writeFileSync(precommit, precommitContent); }
catch (e) {
  console.error('pre-commit:');
  console.error('pre-commit: Failed to create the hook file in your .git/hooks folder because:');
  console.error('pre-commit: '+ e.message);
  console.error('pre-commit: The hook was not installed.');
  console.error('pre-commit:');
}

try { fs.chmodSync(precommit, 0o755); }
catch (e) {
  console.error('pre-commit:');
  console.error('pre-commit: chmod 0755 the pre-commit file in your .git/hooks folder because:');
  console.error('pre-commit: '+ e.message);
  console.error('pre-commit:');
}
