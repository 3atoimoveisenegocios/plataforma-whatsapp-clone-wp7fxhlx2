import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { MessageSquare, Settings2, LogOut, Loader2, Bot, Kanban, BarChart3 } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useEffect, useState } from 'react'
import { getInstances } from '@/services/whatsapp'
import { useRealtime } from '@/hooks/use-realtime'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from '@/components/ui/sidebar'

export default function Layout() {
  const { user, signOut, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [instance, setInstance] = useState<any>(null)

  const loadInstance = async () => {
    if (!user) return
    try {
      const instances = await getInstances()
      if (instances.length > 0) setInstance(instances[0])
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    loadInstance()
  }, [user])

  useRealtime(
    'whatsapp_instances',
    () => {
      loadInstance()
    },
    !!user,
  )

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <Loader2 className="h-7 w-7 animate-spin text-violet-500" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-sm">
          <div className="container flex h-16 items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 shadow-sm shadow-violet-500/20">
                <MessageSquare className="h-[18px] w-[18px] text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight text-slate-900">ZappFlow</span>
            </Link>
            <nav className="flex items-center gap-4">
              <Button variant="ghost" asChild>
                <Link to="/login">Entrar</Link>
              </Button>
              <Button className="bg-violet-500 hover:bg-violet-600" asChild>
                <Link to="/register">Começar Agora</Link>
              </Button>
            </nav>
          </div>
        </header>
        <main className="flex-1 flex flex-col">
          <Outlet />
        </main>
      </div>
    )
  }

  const handleLogout = () => {
    signOut()
    navigate('/')
  }

  const isConnected = instance?.status === 'connected'
  const isConnecting = instance?.status === 'connecting' || instance?.status === 'pending'

  const navItems = [
    { to: '/inbox', label: 'Caixa de Entrada', icon: MessageSquare },
    { to: '/pipeline', label: 'Pipeline', icon: Kanban },
    { to: '/dashboard', label: 'Dashboard', icon: BarChart3 },
    { to: '/agents', label: 'Agentes IA', icon: Bot },
  ]

  return (
    <SidebarProvider>
      <Sidebar variant="inset" className="border-r border-zinc-200/70 bg-white">
        <SidebarHeader className="px-4 pb-5 pt-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 shadow-sm shadow-violet-500/20">
              <MessageSquare className="h-[18px] w-[18px] text-white" />
            </div>
            <span className="text-[17px] font-semibold tracking-tight text-zinc-900">ZappFlow</span>
          </div>
        </SidebarHeader>
        <SidebarContent className="px-3 pt-2">
          <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Workspace
          </div>
          <SidebarMenu className="gap-0.5">
            {navItems.map(({ to, label, icon: Icon }) => {
              const active = location.pathname === to
              return (
                <SidebarMenuItem key={to}>
                  <SidebarMenuButton
                    asChild
                    isActive={active}
                    className={cn(
                      'h-9 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors',
                      active
                        ? 'bg-violet-50 text-violet-700 hover:bg-violet-50 hover:text-violet-700'
                        : 'text-zinc-600 hover:bg-zinc-100/70 hover:text-zinc-900',
                    )}
                  >
                    <Link to={to}>
                      <Icon
                        className={cn('h-4 w-4', active ? 'text-violet-600' : 'text-zinc-400')}
                      />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={location.pathname === '/connection-setup'}
                className={cn(
                  'h-9 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors',
                  location.pathname === '/connection-setup'
                    ? 'bg-violet-50 text-violet-700 hover:bg-violet-50 hover:text-violet-700'
                    : 'text-zinc-600 hover:bg-zinc-100/70 hover:text-zinc-900',
                )}
              >
                <Link to="/connection-setup">
                  <Settings2
                    className={cn(
                      'h-4 w-4',
                      location.pathname === '/connection-setup'
                        ? 'text-violet-600'
                        : 'text-zinc-400',
                    )}
                  />
                  <span>Conexão</span>
                  {isConnected && (
                    <span className="ml-auto flex h-1.5 w-1.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
                  )}
                  {isConnecting && (
                    <span className="ml-auto flex h-1.5 w-1.5 rounded-full bg-amber-500 ring-2 ring-amber-500/20 animate-pulse" />
                  )}
                  {instance?.status === 'disconnected' && (
                    <span className="ml-auto flex h-1.5 w-1.5 rounded-full bg-zinc-300" />
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="border-t border-zinc-200/70 p-3">
          <div className="flex items-center gap-2.5 rounded-lg p-2">
            <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center text-[13px] font-semibold text-zinc-700 ring-1 ring-zinc-200">
              {(user.name?.charAt(0) || user.email?.charAt(0))?.toUpperCase()}
            </div>
            <div className="flex flex-col overflow-hidden flex-1 min-w-0">
              <span className="text-[13px] font-medium text-zinc-900 truncate leading-tight">
                {user.name || 'User'}
              </span>
              <span className="text-[11.5px] text-zinc-500 truncate">{user.email}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start h-9 text-[13.5px] text-zinc-600 hover:bg-zinc-100/70 hover:text-zinc-900 mt-1 px-2.5"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4 text-zinc-400" />
            Sair
          </Button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="bg-zinc-50/60">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-200/70 bg-white px-4 md:hidden">
          <SidebarTrigger />
          <span className="font-semibold tracking-tight text-zinc-900">ZappFlow</span>
        </header>
        <div className="flex flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
