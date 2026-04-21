import { Sidebar } from './components/Layout/Sidebar'
import { ChatInterface } from './components/Chat/ChatInterface'

export default function App() {
  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden relative font-sans selection:bg-brand-500/30">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <ChatInterface />
      </main>
    </div>
  )
}
