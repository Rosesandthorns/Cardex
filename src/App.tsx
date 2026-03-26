import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, ShoppingBag, Library, Coins, X, ChevronRight, Trophy } from 'lucide-react';
import { Card, Rarity } from './types';
import { INITIAL_CARDS as CARDS, INITIAL_PACKS } from './constants';
import { RarePairs } from './components/RarePairs';

const DISGRACE_PACK = INITIAL_PACKS.find(p => p.id === 'disgrace-pack')!;

// --- Components ---

const CardComponent = ({ card, size = 'md', showInfo = true }: { card: Card; size?: 'sm' | 'md' | 'lg'; showInfo?: boolean }) => {
  const rarityColors: Record<Rarity, string> = {
    [Rarity.COMMON]: 'text-zinc-400',
    [Rarity.UNCOMMON]: 'text-blue-400',
    [Rarity.RARE]: 'text-purple-400',
    [Rarity.LEGENDARY]: 'text-amber-400',
  };

  const rarityBorders: Record<Rarity, string> = {
    [Rarity.COMMON]: 'border-zinc-800',
    [Rarity.UNCOMMON]: 'border-blue-900/50',
    [Rarity.RARE]: 'border-purple-900/50',
    [Rarity.LEGENDARY]: 'border-amber-500/50 legendary-glow',
  };

  const sizes = {
    sm: 'w-32 h-44',
    md: 'w-48 h-64',
    lg: 'w-64 h-88',
  };

  if (card.isFullArt) {
    return (
      <motion.div
        layoutId={card.id}
        className={`${sizes[size]} rounded-xl overflow-hidden border-2 ${rarityBorders[card.rarity]} relative group cursor-pointer`}
      >
        <img 
          src={card.image} 
          alt={card.name} 
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
          <p className="text-[10px] font-mono tracking-widest uppercase text-white/50">Full Art Legendary</p>
        </div>
        <div className="card-shimmer absolute inset-0 pointer-events-none" />
      </motion.div>
    );
  }

  return (
    <motion.div
      layoutId={card.id}
      className={`${sizes[size]} rounded-xl overflow-hidden border-2 ${rarityBorders[card.rarity]} bg-zinc-900 flex flex-col relative group cursor-pointer`}
    >
      <div className="flex-1 overflow-hidden relative">
        <img 
          src={card.image} 
          alt={card.name} 
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          referrerPolicy="no-referrer"
        />
        <div className="card-shimmer absolute inset-0 pointer-events-none" />
      </div>
      
      {showInfo && (
        <div className="p-3 bg-zinc-950 border-t border-white/5">
          <p className={`text-[10px] font-mono tracking-widest uppercase ${rarityColors[card.rarity]} mb-1`}>
            {card.rarity}
          </p>
          <h3 className="text-sm font-display font-bold text-white truncate">{card.name}</h3>
        </div>
      )}
    </motion.div>
  );
};

const PackOpening = ({ onComplete }: { onComplete: (cards: Card[]) => void }) => {
  const [step, setStep] = useState<'closed' | 'opening' | 'revealing'>('closed');
  const [pulledCards, setPulledCards] = useState<Card[]>([]);
  const [revealIndex, setRevealIndex] = useState(-1);

  const openPack = () => {
    setStep('opening');
    
    // Simulate opening delay
    setTimeout(() => {
      const newCards: Card[] = [];
      for (let i = 0; i < 5; i++) {
        const rand = Math.random();
        let rarity: Rarity = Rarity.COMMON;
        
        if (rand < 0.0005) rarity = Rarity.LEGENDARY;
        else if (rand < 0.15) rarity = Rarity.RARE;
        else if (rand < 0.35) rarity = Rarity.UNCOMMON;
        
        const possibleCards = CARDS.filter(c => c.rarity === rarity);
        const selectedCard = possibleCards[Math.floor(Math.random() * possibleCards.length)];
        newCards.push(selectedCard);
      }
      setPulledCards(newCards);
      setStep('revealing');
      setRevealIndex(0);
    }, 1500);
  };

  const nextCard = () => {
    if (revealIndex < pulledCards.length - 1) {
      setRevealIndex(prev => prev + 1);
    } else {
      onComplete(pulledCards);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm p-6">
      <AnimatePresence mode="wait">
        {step === 'closed' && (
          <motion.div
            key="closed"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.2, opacity: 0 }}
            className="flex flex-col items-center gap-8"
          >
            <div className="relative w-64 h-96 group cursor-pointer" onClick={openPack}>
              <motion.img
                src={DISGRACE_PACK.image}
                alt="Pack Cover"
                className="w-full h-full object-cover rounded-2xl shadow-2xl border border-white/10"
                whileHover={{ scale: 1.05, rotate: 2 }}
                whileTap={{ scale: 0.95 }}
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent rounded-2xl flex flex-col justify-end p-6">
                <h2 className="text-2xl font-display font-bold text-white mb-2">Disgrace Pack</h2>
                <p className="text-emerald-400 font-mono text-sm tracking-widest uppercase">Tap to Open</p>
              </div>
            </div>
          </motion.div>
        )}

        {step === 'opening' && (
          <motion.div
            key="opening"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-6"
          >
            <motion.div
              animate={{ 
                rotate: [0, -2, 2, -2, 2, 0],
                scale: [1, 1.05, 1, 1.05, 1]
              }}
              transition={{ duration: 0.5, repeat: Infinity }}
              className="w-64 h-96 relative"
            >
              <img src={DISGRACE_PACK.image} className="w-full h-full object-cover rounded-2xl opacity-50 grayscale" referrerPolicy="no-referrer" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles className="w-16 h-16 text-emerald-400 animate-pulse" />
              </div>
            </motion.div>
            <p className="text-emerald-400 font-mono text-sm tracking-widest uppercase animate-pulse">Opening Pack...</p>
          </motion.div>
        )}

        {step === 'revealing' && revealIndex >= 0 && (
          <motion.div
            key="revealing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-12 w-full max-w-lg"
          >
            <div className="relative">
              <AnimatePresence mode="wait">
                <motion.div
                  key={revealIndex}
                  initial={{ x: 100, opacity: 0, rotateY: 90 }}
                  animate={{ x: 0, opacity: 1, rotateY: 0 }}
                  exit={{ x: -100, opacity: 0, rotateY: -90 }}
                  transition={{ type: 'spring', damping: 15 }}
                >
                  <CardComponent card={pulledCards[revealIndex]} size="lg" />
                </motion.div>
              </AnimatePresence>
              
              {/* Progress dots */}
              <div className="flex justify-center gap-2 mt-8">
                {pulledCards.map((_, i) => (
                  <div 
                    key={i} 
                    className={`h-1 rounded-full transition-all duration-300 ${i === revealIndex ? 'w-8 bg-emerald-400' : 'w-2 bg-white/20'}`} 
                  />
                ))}
              </div>
            </div>

            <button
              onClick={nextCard}
              className="px-12 py-4 bg-white text-black font-bold rounded-full hover:bg-emerald-400 transition-colors active:scale-95 flex items-center gap-2"
            >
              {revealIndex === pulledCards.length - 1 ? 'Finish' : 'Next Card'}
              <ChevronRight className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [balance, setBalance] = useState(() => {
    const saved = localStorage.getItem('vantage_balance');
    return saved ? parseInt(saved) : 1000;
  });
  
  const [collection, setCollection] = useState<Card[]>(() => {
    const saved = localStorage.getItem('vantage_collection');
    return saved ? JSON.parse(saved) : [];
  });

  const [view, setView] = useState<'store' | 'collection' | 'rare-pairs'>('store');
  const [streak, setStreak] = useState(() => {
    const saved = localStorage.getItem('vantage_streak');
    return saved ? parseInt(saved) : 0;
  });
  const [isOpening, setIsOpening] = useState(false);

  useEffect(() => {
    localStorage.setItem('vantage_balance', balance.toString());
  }, [balance]);

  useEffect(() => {
    localStorage.setItem('vantage_collection', JSON.stringify(collection));
  }, [collection]);

  useEffect(() => {
    localStorage.setItem('vantage_streak', streak.toString());
  }, [streak]);

  const buyPack = () => {
    if (balance >= DISGRACE_PACK.price) {
      setBalance(prev => prev - DISGRACE_PACK.price);
      setIsOpening(true);
    } else {
      alert('Not enough credits!');
    }
  };

  const handlePackComplete = (newCards: Card[]) => {
    setCollection(prev => [...prev, ...newCards]);
    setIsOpening(false);
    setView('collection');
  };

  const addCredits = () => {
    setBalance(prev => prev + 500);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 selection:bg-emerald-500/30">
      {/* Header */}
      <header className="sticky top-0 z-40 glass-panel px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-emerald-400" />
          </div>
          <h1 className="text-xl font-display font-bold tracking-tight">VANTAGE</h1>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10">
            <Coins className="w-4 h-4 text-amber-400" />
            <span className="font-mono font-bold">{balance}</span>
            <button 
              onClick={addCredits}
              className="ml-2 w-5 h-5 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center text-xs hover:bg-emerald-500 hover:text-black transition-colors"
            >
              +
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="flex justify-center gap-4 py-8">
        <button
          onClick={() => setView('store')}
          className={`flex items-center gap-2 px-6 py-2 rounded-full transition-all ${view === 'store' ? 'bg-white text-black font-bold' : 'text-zinc-500 hover:text-white'}`}
        >
          <ShoppingBag className="w-4 h-4" />
          Store
        </button>
        <button
          onClick={() => setView('collection')}
          className={`flex items-center gap-2 px-6 py-2 rounded-full transition-all ${view === 'collection' ? 'bg-white text-black font-bold' : 'text-zinc-500 hover:text-white'}`}
        >
          <Library className="w-4 h-4" />
          Collection
        </button>
        <button
          onClick={() => setView('rare-pairs')}
          className={`flex items-center gap-2 px-6 py-2 rounded-full transition-all ${view === 'rare-pairs' ? 'bg-white text-black font-bold' : 'text-zinc-500 hover:text-white'}`}
        >
          <Trophy className="w-4 h-4" />
          Rare Pairs
        </button>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 pb-24">
        <AnimatePresence mode="wait">
          {view === 'store' ? (
            <motion.div
              key="store"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
            >
              <div className="glass-panel rounded-3xl p-8 flex flex-col items-center text-center group">
                <div className="relative w-full aspect-[2/3] mb-8 overflow-hidden rounded-2xl border border-white/10">
                  <img 
                    src={DISGRACE_PACK.image} 
                    alt="Pack Cover" 
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-6">
                    <div className="flex justify-center gap-1 mb-4">
                      <div className="w-2 h-2 rounded-full bg-zinc-400" />
                      <div className="w-2 h-2 rounded-full bg-blue-400" />
                      <div className="w-2 h-2 rounded-full bg-purple-400" />
                      <div className="w-2 h-2 rounded-full bg-amber-400" />
                    </div>
                  </div>
                </div>
                
                <h2 className="text-3xl font-display font-bold mb-2">Disgrace Pack</h2>
                <p className="text-zinc-500 mb-8 text-sm max-w-[240px]">
                  Contains 5 cards with a chance for legendary full art pulls.
                </p>

                <div className="w-full space-y-4">
                  <div className="flex justify-between text-[10px] font-mono uppercase tracking-widest text-zinc-500 border-b border-white/5 pb-2">
                    <span>Common</span>
                    <span>65%</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-mono uppercase tracking-widest text-blue-400/60 border-b border-white/5 pb-2">
                    <span>Uncommon</span>
                    <span>20%</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-mono uppercase tracking-widest text-purple-400/60 border-b border-white/5 pb-2">
                    <span>Rare</span>
                    <span>14.95%</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-mono uppercase tracking-widest text-amber-400 border-b border-white/5 pb-2">
                    <span>Legendary</span>
                    <span>0.05%</span>
                  </div>
                </div>

                <button
                  onClick={buyPack}
                  disabled={balance < DISGRACE_PACK.price}
                  className="mt-8 w-full py-4 bg-emerald-500 text-black font-bold rounded-2xl hover:bg-emerald-400 transition-all disabled:opacity-50 disabled:grayscale active:scale-95 flex items-center justify-center gap-2"
                >
                  <Coins className="w-5 h-5" />
                  Buy for {DISGRACE_PACK.price}
                </button>
              </div>
            </motion.div>
          ) : view === 'collection' ? (
            <motion.div
              key="collection"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="flex items-center justify-between mb-12">
                <div>
                  <h2 className="text-4xl font-display font-bold mb-2">My Collection</h2>
                  <p className="text-zinc-500 font-mono text-sm uppercase tracking-widest">
                    {collection.length} Cards Collected
                  </p>
                </div>
                
                <div className="flex gap-4">
                  <div className="glass-panel px-6 py-3 rounded-2xl flex flex-col items-center">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase">Legendary</span>
                    <span className="text-xl font-bold text-amber-400">
                      {collection.filter(c => c.rarity === Rarity.LEGENDARY).length}
                    </span>
                  </div>
                </div>
              </div>

              {collection.length === 0 ? (
                <div className="glass-panel rounded-3xl p-24 text-center">
                  <Trophy className="w-12 h-12 text-zinc-800 mx-auto mb-6" />
                  <p className="text-zinc-500 font-serif italic text-xl">Your vault is empty. Visit the store to begin your journey.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                  {collection.slice().reverse().map((card, index) => (
                    <motion.div
                      key={`${card.id}-${index}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <CardComponent card={card} size="sm" />
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : view === 'rare-pairs' ? (
            <motion.div
              key="rare-pairs"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <RarePairs 
                collection={collection}
                balance={balance}
                setBalance={setBalance}
                streak={streak}
                setStreak={setStreak}
                onBack={() => setView('collection')}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>

      {/* Pack Opening Overlay */}
      <AnimatePresence>
        {isOpening && (
          <PackOpening onComplete={handlePackComplete} />
        )}
      </AnimatePresence>
    </div>
  );
}
