import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return;
          }

          if (id.includes('lightweight-charts')) return 'vendor_lightweight_charts';
          if (id.includes('html2canvas')) return 'vendor_html2canvas';
          if (id.includes('recharts')) return 'vendor_recharts';
          if (id.includes('socket.io-client')) return 'vendor_socketio';
          if (id.includes('react-router')) return 'vendor_router';
          return 'vendor';
        }
      }
    }
  }
})
