import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
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
      <ErrorBoundary><App /></ErrorBoundary>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#211f1d',
            color: '#f2eee8',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: 500,
          },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>,
)
