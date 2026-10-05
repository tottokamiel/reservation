import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { School, LogOut, User } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs: { id: string; label: string; icon: React.ReactNode }[];
}

export default function Layout({ children, activeTab, onTabChange, tabs }: LayoutProps) {
  const { profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const isCoordinator = profile?.role === 'coordinator';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-600 shadow-md shadow-blue-600/20">
                <School className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 leading-tight">Equipment Hub</h1>
                <p className="text-xs text-slate-500 leading-tight">
                  {isCoordinator ? 'Coordinator Portal' : 'Teacher Portal'}
                </p>
              </div>
            </div>

            {/* Desktop tabs */}
            <nav className="hidden md:flex items-center gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </nav>

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600">
                  <User className="w-4 h-4" />
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-sm font-medium text-slate-900 leading-tight">
                    {profile?.full_name || 'User'}
                  </p>
                  <p className="text-xs text-slate-500 leading-tight capitalize">
                    {profile?.role || 'teacher'}
                  </p>
                </div>
              </button>

              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {profile?.full_name || 'User'}
                      </p>
                      <p className="text-xs text-slate-500 capitalize">
                        {profile?.role || 'teacher'}
                      </p>
                    </div>
                    <button
                      onClick={() => signOut()}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Mobile tabs */}
        <nav className="md:hidden flex items-center gap-1 px-4 pb-3 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
