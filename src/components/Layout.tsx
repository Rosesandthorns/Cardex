import React from 'react';
import { Home, Layers, ShoppingBag, ArrowLeftRight, Globe, User, Bell, Calendar, HelpCircle, Sparkles, CircleDollarSign, Cpu, Search } from 'lucide-react';
import { motion } from 'motion/react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  chips: number;
  userPhotoURL?: string;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab, chips, userPhotoURL }) => {
  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'collection', label: 'Collection', icon: Layers },
    { id: 'list', label: 'List', icon: Search },
    { id: 'market', label: 'Market', icon: Globe },
    { id: 'trades', label: 'Trades', icon: ArrowLeftRight },
    { id: 'money', label: 'Money', icon: CircleDollarSign },
    { id: 'events', label: 'Events', icon: Calendar },
    { id: 'faq', label: 'FAQ', icon: HelpCircle },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-navy-900">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-navy-800 border-r border-white/5 p-6 sticky top-0 h-screen">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Layers className="text-white" size={24} />
          </div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-white">Vantage</h1>
        </div>

        <nav className="flex-grow space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200 ${
                activeTab === item.id
                  ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <item.icon size={20} />
              <span className="font-medium">{item.label}</span>
              {activeTab === item.id && (
                <motion.div
                  layoutId="activeNav"
                  className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]"
                />
              )}
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-white/5">
          <div className="bg-navy-700/50 rounded-2xl p-4 border border-white/5">
            <p className="text-xs text-slate-500 uppercase font-bold tracking-widest mb-1">Balance</p>
            <div className="flex items-center gap-2 text-amber-400 font-display font-bold text-xl">
              <Sparkles size={16} className="text-amber-500" />
              <span>{chips.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-grow pb-24 md:pb-0 overflow-x-hidden">
        {/* Top Bar (Mobile/Desktop Header) */}
        <header className="flex items-center justify-between p-6 md:px-10 md:py-8">
          <div className="md:hidden flex items-center gap-2">
            <Layers className="text-indigo-500" size={24} />
            <h1 className="text-xl font-display font-bold text-white">Vantage</h1>
          </div>
          <div className="hidden md:block">
            <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">
              {navItems.find(i => i.id === activeTab)?.label}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 bg-navy-800 flex items-center justify-center">
              {userPhotoURL ? (
                <img 
                  src={userPhotoURL}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <User className="text-slate-500" size={20} />
              )}
            </div>
          </div>
        </header>

        <div className="px-6 md:px-10 pb-10">
          {children}
        </div>
      </main>

      {/* Mobile Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-navy-800/90 backdrop-blur-xl border-t border-white/5 px-4 py-3 flex justify-between items-center z-50">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center gap-1 transition-colors ${
              activeTab === item.id ? 'text-indigo-400' : 'text-slate-500'
            }`}
          >
            <item.icon size={20} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};
