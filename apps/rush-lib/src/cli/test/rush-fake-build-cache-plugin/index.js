const rushBuildCacheProvider = {
  isCacheWriteAllowed: false,

  tryGetCacheEntryBufferByIdAsync: jest.fn(),
  trySetCacheEntryBufferAsync: jest.fn(),
  updateCachedCredentialAsync: jest.fn(),
  updateCachedCredentialInteractiveAsync: jest.fn(),
  deleteCachedCredentialsAsync: jest.fn()
};

class RushFakeBuildCachePlugin {
  static provider = rushBuildCacheProvider;
  apply(rushSession) {
    rushSession.hooks.initialize.tap('rush-fake-build-cache-plugin', function () {
      rushSession.registerCloudBuildCacheProviderFactory('fake', function () {
        return rushBuildCacheProvider;
      });
    });
  }
}

module.exports = RushFakeBuildCachePlugin;
