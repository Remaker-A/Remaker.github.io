import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import './styles/tokens.css'
import Home from './pages/Home'
import Result from './pages/Result'
import MyRecipes from './pages/MyRecipes'
import Discover from './pages/Discover'
import Settings from './pages/Settings'
import { initAnalytics } from './lib/analytics'

initAnalytics()

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/result" element={<Result />} />
        <Route path="/recipes" element={<MyRecipes />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)