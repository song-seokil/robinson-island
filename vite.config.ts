import { defineConfig } from 'vite';

export default defineConfig({
  // Vite 의존성 캐시는 프로젝트 안에 둔다 — C: 는 Windows/앱 전용으로 유지
  cacheDir: '.vite-cache',
  base: './',            // Capacitor/WebView friendly
  server: {
    host: true,
    port: 5173,
    // S: 네트워크 드라이브는 네이티브 fs.watch 를 지원하지 않아 polling 으로 감시한다.
    // png/도구 파일까지 감시하면 느려지므로 제외한다.
    watch: {
      usePolling: true,
      interval: 1000,
      ignored: ['**/public/**', '**/tools/**', '**/*.png'],
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: 'index.html',
        island3d: 'index3d.html',
      },
    },
  },
});
