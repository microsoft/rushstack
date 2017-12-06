module.exports = {
  hooks: {
    readPackage
  }
}

function readPackage (pkg) {
  if (pkg.name === 'jest-runtime') {
    pkg.dependencies['slash'] = '^1.0.0';
  }
  return pkg;
}