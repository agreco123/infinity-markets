// vite.config.js
import { defineConfig } from "file:///sessions/elegant-confident-darwin/mnt/outputs/staging/infinity-markets-main/client/node_modules/vite/dist/node/index.js";
import react from "file:///sessions/elegant-confident-darwin/mnt/outputs/staging/infinity-markets-main/client/node_modules/@vitejs/plugin-react/dist/index.js";
var vite_config_default = defineConfig({
  plugins: [react()],
  esbuild: {
    loader: "jsx",
    include: /\.[jt]sx?$/
  },
  optimizeDeps: {
    esbuild: {
      loader: { ".js": "jsx" }
    }
  },
  server: {
    port: 3e3,
    proxy: {
      "/api": "http://localhost:4000"
    }
  },
  build: {
    outDir: "dist"
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvc2Vzc2lvbnMvZWxlZ2FudC1jb25maWRlbnQtZGFyd2luL21udC9vdXRwdXRzL3N0YWdpbmcvaW5maW5pdHktbWFya2V0cy1tYWluL2NsaWVudFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL3Nlc3Npb25zL2VsZWdhbnQtY29uZmlkZW50LWRhcndpbi9tbnQvb3V0cHV0cy9zdGFnaW5nL2luZmluaXR5LW1hcmtldHMtbWFpbi9jbGllbnQvdml0ZS5jb25maWcuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL3Nlc3Npb25zL2VsZWdhbnQtY29uZmlkZW50LWRhcndpbi9tbnQvb3V0cHV0cy9zdGFnaW5nL2luZmluaXR5LW1hcmtldHMtbWFpbi9jbGllbnQvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtyZWFjdCgpXSxcbiAgZXNidWlsZDoge1xuICAgIGxvYWRlcjogJ2pzeCcsXG4gICAgaW5jbHVkZTogL1xcLltqdF1zeD8kLyxcbiAgfSxcbiAgb3B0aW1pemVEZXBzOiB7XG4gICAgZXNidWlsZDoge1xuICAgICAgbG9hZGVyOiB7ICcuanMnOiAnanN4JyB9LFxuICAgIH0sXG4gIH0sXG4gIHNlcnZlcjoge1xuICAgIHBvcnQ6IDMwMDAsXG4gICAgcHJveHk6IHtcbiAgICAgICcvYXBpJzogJ2h0dHA6Ly9sb2NhbGhvc3Q6NDAwMCcsXG4gICAgfSxcbiAgfSxcbiAgYnVpbGQ6IHtcbiAgICBvdXREaXI6ICdkaXN0JyxcbiAgfSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUEyYSxTQUFTLG9CQUFvQjtBQUN4YyxPQUFPLFdBQVc7QUFFbEIsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLE1BQU0sQ0FBQztBQUFBLEVBQ2pCLFNBQVM7QUFBQSxJQUNQLFFBQVE7QUFBQSxJQUNSLFNBQVM7QUFBQSxFQUNYO0FBQUEsRUFDQSxjQUFjO0FBQUEsSUFDWixTQUFTO0FBQUEsTUFDUCxRQUFRLEVBQUUsT0FBTyxNQUFNO0FBQUEsSUFDekI7QUFBQSxFQUNGO0FBQUEsRUFDQSxRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsTUFDTCxRQUFRO0FBQUEsSUFDVjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNMLFFBQVE7QUFBQSxFQUNWO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
