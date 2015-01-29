describe('pre-commit', function () {
  'use strict';

  var assume = require('assume')
    , pre = require('./hook');

  it('is exported as an object', function () {
    assume(pre).is.a('object');
  });
});
