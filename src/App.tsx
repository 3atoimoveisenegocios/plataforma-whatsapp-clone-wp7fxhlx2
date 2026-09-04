import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/hooks/use-auth'
import Layout from './components/Layout'
import Index from './pages/Index'
import Login from './pages/Login'
import Register from './pages/Register'
import ConnectionSetup from './pages/ConnectionSetup'
import Inbox from './pages/Inbox'
import Agents from './pages/Agents'
import Pipeline from './pages/Pipeline'
import Dashboard from './pages/Dashboard'
import Proposals from './pages/Proposals'
import NotFound from './pages/NotFound'

const App = () => (
  <BrowserRouter>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/connection-setup" element={<ConnectionSetup />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/propostas" element={<Proposals />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/dashboard" element={<Dashboard />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </TooltipProvider>
  </BrowserRouter>
)

export default App
