import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true // 모든 외부 호스트 접속을 허용합니다 (가장 확실한 방법)
  }
})