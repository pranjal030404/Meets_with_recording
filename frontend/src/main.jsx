import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'
import branding, { pageTitle } from './config/branding'

// White-label runtime branding: set the document title and favicon from
// the same config the app components use (src/config/branding.js).
document.title = pageTitle
if (branding.iconUrl) {
  const link = document.querySelector('link[rel="icon"]')
  if (link) link.href = branding.iconUrl
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'rgba(26, 26, 38, 0.92)',
            color: '#fff',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(129, 140, 248, 0.2)',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
            borderRadius: '14px',
            fontSize: '14px',
            fontWeight: 500,
          },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>,
)
