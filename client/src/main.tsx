import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './simple.css'
import Game from './RoomGame.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
  <Game />
  </StrictMode>,
)
