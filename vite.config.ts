import { defineConfig } from 'vite';

export default defineConfig({
  // 개발 의존성 캐시는 C: 로컬에 둔다 — D: 외장 드라이브의 순간 끊김("device does not exist")으로
  // phaser 의존성 최적화 쓰기가 실패하던 문제(2026-10-17) 회피 + 속도
  cacheDir: 'C:/Users/oocss/AppData/Local/Temp/opencode/vite-cache-robinson',
  base: './',            // Capacitor/WebView friendly
  server: {
    host: true,
    port: 5173,
    // D: 외장 드라이브는 파일 감시가 불안정하다(EBUSY/읽기 실패로 vite 크래시).
    // png 자산과 blender 도구는 바뀌어도 즉시 반영할 필요가 없으니 감시에서 뺀다.
    watch: { ignored: ['**/public/**', '**/tools/**', '**/*.png'] },
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
