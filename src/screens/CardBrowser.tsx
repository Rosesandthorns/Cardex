import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '../components/Card';
import { INITIAL_CARDS } from '../constants';
import { Rarity, UserCard } from '../types';
import { Search, X, Hash, Info } from 'lucide-react';

export const CardBrowser: React.FC = () => {
  const [filter, setFilter] = useState<Rarity | 'All'>('All');
  const [search, setSearch] = useState('');
  const [selectedCard, setSelectedCard] = useState<UserCard | null>(null);

  // Create a list of "Master" cards (print #0, no owner)
  const masterList: UserCard[] = INITIAL_CARDS.map(card => ({
    id: `master-${card.id}`,
    cardId: card.id,
    ownerUid: 'system',
    printNumber: 0,
    totalPrintRun: card.totalPrintRun,
    acquiredAt: new Date().toISOString(),
    card: card
  }));

  const filteredCards = masterList
    .filter(userCard => {
      if (!userCard.card) return false;
      const matchesFilter = filter === 'All' || userCard.card.rarity === filter;
      const matchesSearch = userCard.card.name.toLowerCase().includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    })
    .sort((a, b) => {
      if (!a.card || !b.card) return 0;
      
      // 1. Pack
      const packCompare = a.card.packName.localeCompare(b.card.packName);
      if (packCompare !== 0) return packCompare;
      
      // 2. Name
      const nameCompare = a.card.name.localeCompare(b.card.name);
      if (nameCompare !== 0) return nameCompare;
      
      // 3. Card ID (Natural Sort)
      return a.card.id.localeCompare(b.card.id, undefined, { numeric: true, sensitivity: 'base' });
    });

  return (
    <div className="space-y-8">
      {/* Header & Filters */}
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-3xl font-display font-bold text-white">Master List</h2>
            <p className="text-zinc-500 text-sm">A complete catalog of every card ever released in Vantage.</p>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
            <input
              type="text"
              placeholder="Search characters..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-900/50 border border-white/5 rounded-2xl py-3 pl-12 pr-4 focus:outline-none focus:border-emerald-500/50 transition-colors text-white"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 bg-zinc-900/50 p-1 rounded-2xl border border-white/5 w-full md:w-auto overflow-x-auto no-scrollbar">
          {['All', ...Object.values(Rarity)].map(r => (
            <button
              key={r}
              onClick={() => setFilter(r as any)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                filter === r ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filteredCards.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {filteredCards.map((userCard) => (
            <Card key={userCard.id} card={userCard} onClick={() => setSelectedCard(userCard)} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-600">
            <Search size={40} />
          </div>
          <div>
            <h3 className="text-xl font-display font-bold text-white">No cards found</h3>
            <p className="text-zinc-500">Try adjusting your search query.</p>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-8 flex items-start gap-6">
        <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400">
          <Info size={24} />
        </div>
        <div className="space-y-2">
          <h4 className="text-lg font-display font-bold text-white">Card Scarcity</h4>
          <p className="text-zinc-400 text-sm leading-relaxed max-w-3xl">
            This list shows every card available in the game. Each card has a fixed global print run. Once all copies are claimed through pack openings, that card is officially "Sold Out" and will never appear in packs again.
          </p>
        </div>
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedCard && selectedCard.card && (
          <div className="fixed inset-0 z-[110] overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedCard(null)}
              className="fixed inset-0 bg-black/80 backdrop-blur-md"
            />
            <div className="min-h-full flex items-center justify-center p-4 md:p-6">
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="relative bg-zinc-900 rounded-[32px] md:rounded-[40px] border border-white/10 p-6 md:p-8 max-w-4xl w-full flex flex-col md:flex-row gap-6 md:gap-10 my-8"
              >
                <div className="shrink-0 flex justify-center">
                  <Card card={selectedCard} size="lg" />
                </div>
                
                <div className="flex-grow space-y-6 md:space-y-8">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-3xl md:text-4xl font-display font-bold text-white mb-2">{selectedCard.card.name}</h2>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-widest bg-white/5 border border-white/10 text-zinc-300`}>
                          {selectedCard.card.rarity}
                        </span>
                        <span className="text-zinc-500 text-xs md:text-sm font-mono">Pack: {selectedCard.card.packName}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => setSelectedCard(null)}
                      className="p-2 hover:bg-white/5 rounded-full transition-colors shrink-0"
                    >
                      <X size={24} className="text-zinc-500" />
                    </button>
                  </div>

                  <div className="bg-zinc-800/50 rounded-2xl p-4 border border-white/5">
                    <div className="flex items-center gap-2 mb-1">
                      <Hash size={12} className="text-emerald-400" />
                      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Total Print Run</p>
                    </div>
                    <p className="text-xl md:text-2xl font-display font-bold text-white">
                      {selectedCard.card.totalPrintRun} <span className="text-zinc-500 text-base md:text-lg">copies globally</span>
                    </p>
                  </div>

                  <div className="p-6 bg-zinc-800/30 border border-white/5 rounded-2xl">
                    <p className="text-zinc-400 text-sm leading-relaxed italic">
                      "This is a master record of the {selectedCard.card.name} card. Individual print numbers are assigned to users as they are pulled from packs."
                    </p>
                  </div>

                  <div className="pt-4">
                    <div className="p-4 bg-zinc-800/50 border border-white/5 rounded-2xl text-center">
                      <p className="text-zinc-500 font-bold text-sm uppercase tracking-widest">Master List View Only</p>
                      <p className="text-zinc-600 text-xs mt-1">You cannot trade or sell cards directly from the master list.</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
