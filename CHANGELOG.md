## 0.0.4
- Added a better error message when you fucked up your `package.json`.
- Only run tests if there are changes.
- Improved output formatting.

## 0.0.3
- Added compatiblity for Node.js 0.6 by falling back to path.existsSync.

## 0.0.2
- Fixed a typo in the output, see #1.

## 0.0.1
- Use `spawn` instead of `exec` and give custom file descriptors. This way we
  can output color and have more control over the process.

## 0.0.0
- Initial release.
