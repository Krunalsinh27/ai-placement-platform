import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initSessionSecurity } from './utils/sessionManager'

// Initialize back/forward cache and cross-tab logout protection
initSessionSecurity()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
