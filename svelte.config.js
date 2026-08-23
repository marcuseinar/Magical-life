import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ fallback: '200.html', precompress: false }),
    // GitHub Pages serves the project site from /<repo>. CI sets BASE_PATH.
    paths: { base: process.env.BASE_PATH ?? '', relative: false },
    alias: {
      $domain: 'src/domain',
      $application: 'src/application',
      $adapters: 'src/adapters',
      $ui: 'src/ui'
    }
  }
};
