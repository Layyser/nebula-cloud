import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@nebula/runtime-ui/styles.css'
import './cloud.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
