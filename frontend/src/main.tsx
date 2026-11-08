import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

// Register the PWA service worker with active polling for iOS
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('New app update available! Reload to apply?')) {
      updateSW(true)
    }
  },
  onRegistered(r) {
    if (r) {
      // Check for updates every time the app comes back to the foreground (crucial for iOS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          r.update();
        }
      });
      // Fallback hourly check
      setInterval(() => {
        r.update();
      }, 60 * 60 * 1000);
    }
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
