import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '../components/Card';
import { UserCard, Rarity } from '../types';
import { Filter, Search, X, Calendar, Hash, Coins, Trophy } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';

interface CollectionProps {
  collection: UserCard[];
  onProgressQuest: (questId: string, amount?: number) => void;
  onPlayRarePairs: () => void;
}

export const Collection: React.FC<CollectionProps> = ({ collection: userCards, onProgressQuest, onPlayRarePairs }) => {
  const [filter, setFilter] = useState<Rarity | 'All'>('All');
  const [search, setSearch] = useState('');
  const [selectedCard, setSelectedCard] = useState<UserCard | null>(null);
  const [listingPrice, setListingPrice] = useState<string>('');
  const [isListing, setIsListing] = useState(false);
  const [showListingInput, setShowListingInput] = useState(false);

  const filteredCollection = userCards
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
      const idCompare = a.card.id.localeCompare(b.card.id, undefined, { numeric: true, sensitivity: 'base' });
      if (idCompare !== 0) return idCompare;

      // 4. Print Number
      return a.printNumber - b.printNumber;
    });

  const handleListForSale = async () => {
    const price = parseInt(listingPrice);
    if (!selectedCard || isNaN(price) || price <= 0 || isListing || selectedCard.isPendingTrade || selectedCard.isForSale) return;
    setIsListing(true);
    try {
      await addDoc(collection(db, 'market_listings'), {
        sellerUid: selectedCard.ownerUid,
        userCardId: selectedCard.id,
        cardId: selectedCard.cardId,
        printNumber: selectedCard.printNumber,
        totalPrintRun: selectedCard.totalPrintRun,
        price: price,
        active: true,
        createdAt: new Date().toISOString()
      });

      await addDoc(collection(db, 'activities'), {
        uid: selectedCard.ownerUid,
        text: `Listed ${selectedCard.card?.name} #${selectedCard.printNumber} for ${price} Chips`,
        type: 'market',
        timestamp: new Date().toISOString()
      });

      // Progress "Market Guru" quest
      onProgressQuest('q2', 1);

      setSelectedCard(null);
      setListingPrice('');
      setShowListingInput(false);
    } catch (error) {
      console.error("Error listing card:", error);
    } finally {
      setIsListing(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header: Rare Pairs CTA */}
      <div className="flex items-center justify-between">
        <div />
        <button
          onClick={onPlayRarePairs}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 text-indigo-400 font-bold rounded-2xl transition-all active:scale-95"
        >
          <Trophy size={18} />
          Rare Pairs
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
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
        <div className="relative w-full md:w-64">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
          <input
            type="text"
            placeholder="Search collection..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-900/50 border border-white/5 rounded-2xl py-3 pl-12 pr-4 focus:outline-none focus:border-emerald-500/50 transition-colors text-white"
          />
        </div>
      </div>

      {/* Grid */}
      {filteredCollection.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {filteredCollection.map((userCard) => (
            <Card key={userCard.id} card={userCard} onClick={() => setSelectedCard(userCard)} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-600">
            <Filter size={40} />
          </div>
          <div>
            <h3 className="text-xl font-display font-bold text-white">No cards found</h3>
            <p className="text-zinc-500">Try adjusting your filters or search query.</p>
          </div>
          <button 
            onClick={() => {setFilter('All'); setSearch('');}}
            className="text-emerald-400 font-bold hover:underline"
          >
            Clear all filters
          </button>
        </div>
      )}

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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                    <div className="bg-zinc-800/50 rounded-2xl p-4 border border-white/5">
                      <div className="flex items-center gap-2 mb-1">
                        <Hash size={12} className="text-emerald-400" />
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Print Number</p>
                      </div>
                      <p className="text-xl md:text-2xl font-display font-bold text-white">
                        #{selectedCard.printNumber} <span className="text-zinc-500 text-base md:text-lg">/ {selectedCard.card.totalPrintRun}</span>
                      </p>
                    </div>
                    <div className="bg-zinc-800/50 rounded-2xl p-4 border border-white/5">
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar size={12} className="text-emerald-400" />
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Obtained</p>
                      </div>
                      <p className="text-lg md:text-xl font-display font-bold text-white">
                        {new Date(selectedCard.acquiredAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Actions</h4>
                    <div className="flex flex-col gap-4">
                      {selectedCard.isPendingTrade ? (
                        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-center">
                          <p className="text-blue-400 font-bold text-sm">This card is currently in a pending trade.</p>
                          <p className="text-zinc-500 text-xs mt-1">You cannot list it for sale until the trade is resolved.</p>
                        </div>
                      ) : selectedCard.isForSale ? (
                        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-center">
                          <p className="text-rose-500 font-bold text-sm">This card is currently listed for sale.</p>
                          <p className="text-zinc-500 text-xs mt-1">Remove the listing in the Marketplace to trade it.</p>
                        </div>
                      ) : showListingInput ? (
                        <div className="space-y-4 bg-zinc-800/50 p-4 md:p-6 rounded-2xl border border-emerald-500/20">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-white">Set Listing Price</span>
                            <button onClick={() => setShowListingInput(false)} className="text-zinc-500 hover:text-white">
                              <X size={16} />
                            </button>
                          </div>
                          <div className="relative">
                            <Coins className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500" size={20} />
                            <input
                              type="number"
                              placeholder="Enter price in Chips..."
                              value={listingPrice}
                              onChange={(e) => setListingPrice(e.target.value)}
                              className="w-full bg-zinc-900 border border-white/10 rounded-xl py-3 md:py-4 pl-12 pr-4 text-white font-bold focus:outline-none focus:border-emerald-500 text-sm md:text-base"
                            />
                          </div>
                          <button 
                            onClick={handleListForSale}
                            disabled={!listingPrice || parseInt(listingPrice) <= 0 || isListing}
                            className="w-full py-3 md:py-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-black rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/20 text-sm md:text-base"
                          >
                            {isListing ? 'Listing...' : 'Confirm Listing'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row gap-4">
                          <button 
                            onClick={() => setShowListingInput(true)}
                            className="flex-grow py-3 md:py-4 bg-emerald-500 hover:bg-emerald-400 text-black rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/20 text-sm md:text-base"
                          >
                            List on Marketplace
                          </button>
                          <button className="flex-grow py-3 md:py-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl font-bold transition-all border border-white/5 text-sm md:text-base">
                            Offer in Trade
                          </button>
                        </div>
                      )}
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
