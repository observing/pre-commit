## 2.0.0
- **Breaking**: requires Node.js 16.13 or newer. `engines.node` is now
  declared as `">=16.13.0"` to match the minimum required by `which@4`.
- **Breaking**: `cross-spawn` upgraded `^5` → `^7.0.5`, fixing the ReDoS
  vulnerability ([GHSA-3xgq-45jj-v275](https://github.com/advisories/GHSA-3xgq-45jj-v275)).
  `cross-spawn`'s `spawnSync` now returns `status`/`signal`/`error` instead
  of `code`; `index.js` was updated to match.
- **Breaking**: `which` upgraded `1.2.x` → `^4`. The `spawn-sync` runtime
  dependency is dropped in favor of `cross-spawn`'s built-in `spawnSync`.
- **Breaking**: the generated `.git/hooks/pre-commit` wrapper is rewritten.
  It is now a small bash script that `exec`s the package's `hook` file via
  an absolute path (single-line invocation instead of multi-line inline
  bash). Anyone parsing the wrapper file will need to adjust.
- **Breaking**: hook file mode tightened from `0777` to `0755`
  (CIS 6.1.10).
- **Breaking**: submodule installs now write to
  `<super>/.git/modules/<sub>/hooks/pre-commit`. The previous behavior
  silently walked up to the super-project's `.git` directory and installed
  there because the gitdir-parsing branch was unreachable. Linked worktrees
  (whose `.git` is also a file) are handled correctly too.
- The hook now `unset`s `GIT_LITERAL_PATHSPECS`, so commits triggered from
  emacs/magit behave the same as on the command line
  ([magit FAQ](https://magit.vc/manual/magit/My-Git-hooks-work-on-the-command_002dline-but-not-inside-Magit.html)).
- The hook now `cd`s to the git root before resolving `pre-commit` via
  `require.resolve`, so Yarn Plug'n'Play and GUI git clients that invoke
  hooks with an unexpected cwd resolve dependencies correctly.
- The hook is resilient to a missing `pre-commit` package: switching to a
  branch without `node_modules` (or removing the package) no longer blocks
  commits — it exits `0` with a warning instead of throwing a Node
  module-not-found stack trace.
- Fixed handling of `null` close codes and signal-terminated scripts; the
  hook no longer treats a signal kill as success.
- Hardened `install.js` gitdir parsing against missing matches and bad
  input; `gitdir:` paths are resolved relative to the directory containing
  the `.git` file (was incorrectly resolved against the package root).
- `install.js`: typo fix (`"backuped"` → `"backed up"`).
- Dev tooling refresh: `mocha` 3 → 10, `assume` 1 → 2, dropped `istanbul`
  for `nyc`.

## 1.0.2
- Check `/usr/local/bin/node` if we cannot find the binaries in the PATH.

## 1.0.1
- Corrected the `hook` file so it doesn't attempt to run **your** index.js but
  **ours** instead.

## 1.0
- Create symlinks instead of a copying the hook file so we can depend on
  modules.
- More readable output messages.
- Lookup git and npm using `which`.
- Allow nodejs, node and iojs to call the the hook.
- Refactored the way options can be passed in to pre-commit, we're now allowing
  objects.
- The refactor made it possible to test most of the internals so we now have
  90%+ coverage.
- And the list goes on. 

## 0.0.9
- Added missing uninstall hook to remove and restore old scripts.

## 0.0.8
- Added support for installing custom commit templates using `pre-commit.commit-template`

## 0.0.7
- Fixes regression introduced in 0.0.6

## 0.0.6
- Also silence `npm` output when the silent flag has been given.

## 0.0.5
- Allow silencing of the pre-commit output by setting a `precommit.silent: true`
  in your `package.json`

## 0.0.4
- Added a better error message when you fucked up your `package.json`.
- Only run tests if there are changes.
- Improved output formatting.

## 0.0.3
- Added compatibility for Node.js 0.6 by falling back to path.existsSync.

## 0.0.2
- Fixed a typo in the output, see #1.

## 0.0.1
- Use `spawn` instead of `exec` and give custom file descriptors. This way we
  can output color and have more control over the process.

## 0.0.0
- Initial release.
