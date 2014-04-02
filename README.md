# pre-commit

A simple `pre-commit` hook installer for `git`. This will ensure that your
test suite passes before you can commit your changes. In addition to running
your `npm test` it also has the option to run custom scripts that you have
specified in your `package.json`.

### Installation

It's advised to install this module as `devDependency` in your `package.json`
file so it doesn't get installed on production servers. Run:

```
npm install --save-dev pre-commit
```

To install it as `devDependency`. When this module is installed it will override
the existing `pre-commit` file in your `.git/hooks` folder. Existing
`pre-commit` hooks will be backed up.

### Configuration

`pre-commit` will try to run your `npm test` command by default. It does this by
running `npm run test` in the root of your git repository. It will only run that
command if it's not the default values that are entered when you issue an `npm
init`.

But `pre-commit` is not limited to just running your `npm test`'s during the
commit hook. It's also capable of running every other script that you've
specified in your `package.json` "scripts" field. The only thing you need to do
is add a `pre-commit` array to your `package.json` that specifies which scripts
you want to have ran and in which order:

```js
{
  "name": "437464d0899504fb6b7b",
  "version": "0.0.0",
  "description": "ERROR: No README.md file found!",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1",
    "foo": "echo \"fooo\" && exit 0",
    "bar": "echo \"bar\" && exit 0"
  },
  "repository": {
    "type": "git",
    "url": "https://gist.github.com/437464d0899504fb6b7b.git"
  },
  "pre-commit": [
    "foo",
    "bar",
    "test"
  ],
  "author": "",
  "license": "BSD",
  "gitHead": "6637d0771c3a89c4a60be087859dee5130f7a104"
}
```

In the example above, it will first run: `npm run foo` then `npm run bar` and
finally `npm run test` which will make the commit fail as it returns the error
code `1`.

To learn more about the scripts, please read the official `npm` documentation:

https://npmjs.org/doc/scripts.html

### License

MIT
