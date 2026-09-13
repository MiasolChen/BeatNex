import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App'
import './app/design-tokens.css'
import './app/styles.css'
import './app/controls.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('BeatNex root element was not found')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
