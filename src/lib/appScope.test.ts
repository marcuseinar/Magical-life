import { describe, expect, it } from 'vitest';
import { belongsToApp } from './appScope';

/*
 * A service worker's scope is a path prefix, so the app deployed at
 * `/Magical-life/` also covers `/Magical-life/pr-3/` — a pull-request
 * preview, which is a *different* deployment of the same app with its own
 * assets and its own worker. Navigations were already kept apart; assets
 * were not, so opening a preview left its files in the cache the real app
 * reads from, and they were served from there afterwards regardless of what
 * had been rebuilt since.
 */
describe('what belongs to this deployment', () => {
  const precached = ['/Magical-life/', '/Magical-life/manifest.webmanifest'];

  it('claims its own build assets', () => {
    expect(belongsToApp('/Magical-life/_app/immutable/chunks/abc.js', '/Magical-life', [])).toBe(
      true
    );
  });

  it('claims what it precached', () => {
    expect(belongsToApp('/Magical-life/manifest.webmanifest', '/Magical-life', precached)).toBe(
      true
    );
  });

  it('leaves a sibling deployment its own assets, however much they look like ours', () => {
    expect(
      belongsToApp('/Magical-life/pr-3/_app/immutable/chunks/abc.js', '/Magical-life', [])
    ).toBe(false);
    expect(
      belongsToApp('/Magical-life/pr-3/manifest.webmanifest', '/Magical-life', precached)
    ).toBe(false);
  });

  it('holds at the root, where every sibling shares the prefix', () => {
    expect(belongsToApp('/_app/immutable/chunks/abc.js', '', [])).toBe(true);
    expect(belongsToApp('/pr-3/_app/immutable/chunks/abc.js', '', [])).toBe(false);
  });

  /* A cross-origin request has a pathname too, and matching a cache by
   * pathname alone would have served our own file for somebody else's URL. */
  it('says nothing about paths it does not recognise', () => {
    expect(belongsToApp('/tables/ABCD', '/Magical-life', precached)).toBe(false);
  });
});
