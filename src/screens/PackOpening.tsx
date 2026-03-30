import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '../components/Card';
import { INITIAL_CARDS, INITIAL_PACKS } from '../constants';
import { Card as CardType, Rarity, Pack } from '../types';
import { Sparkles } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, where, getDocs, getCountFromServer } from 'firebase/firestore';

interface PackOpeningProps {
  packId: string;
  packCost: number;
  userChips: number;
  onAddCards: (cards: CardType[]) => void;
  onClose: () => void;
  onCancel: () => void;
  count?: number;
}

export const PackOpening: React.FC<PackOpeningProps> = ({ packId, packCost, userChips, onAddCards, onClose, onCancel, count = 1 }) => {
  const [isOpening, setIsOpening] = useState(false);
  const [revealedCards, setRevealedCards] = useState<CardType[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [showBurst, setShowBurst] = useState<Rarity | null>(null);
  const [availableCards, setAvailableCards] = useState<CardType[]>([]);
  const [targetPack, setTargetPack] = useState<Pack | null>(null);
  const [loading, setLoading] = useState(true);
  const pack = INITIAL_PACKS.find(p => p.id === packId);

  useEffect(() => {
    if (packId === 'gambit-pack' && !targetPack) {
      const otherPacks = INITIAL_PACKS.filter(p => p.id !== 'gambit-pack' && p.id !== 'vantage-pack');
      const randomPack = otherPacks[Math.floor(Math.random() * otherPacks.length)];
      setTargetPack(randomPack);
    } else if (packId !== 'gambit-pack') {
      setTargetPack(pack || null);
    }
  }, [pack, packId, targetPack]);

  const fetchAvailableCards = useCallback(async (retryCount = 0) => {
    if (!targetPack) return;
    setLoading(true);
    try {
      const packCards = INITIAL_CARDS.filter(c => c.packName === targetPack.name);
      
      // Fetch all counts in parallel for better performance
      const counts = await Promise.all(
        packCards.map(async (card) => {
          try {
            const q = query(collection(db, 'user_cards'), where('cardId', '==', card.id));
            const snap = await getCountFromServer(q);
            return { card, count: snap.data().count };
          } catch (err) {
            console.error(`Error fetching count for card ${card.id}:`, err);
            return { card, count: card.totalPrintRun }; // Assume full if error to be safe
          }
        })
      );

      const availableAll = counts
        .filter(item => item.count < item.card.totalPrintRun)
        .map(item => item.card);

      // Gambit pack restriction: Cannot pull Vantage Anniversary cards
      const available = packId === 'gambit-pack' 
        ? availableAll.filter(c => !c.name.includes('Vantage'))
        : availableAll;

      if (available.length === 0 && packId === 'gambit-pack' && retryCount < 5) {
        // Silently retry with a different pack pool
        console.log(`[Gambit] Pack ${targetPack.name} sold out, retrying...`);
        const otherPacks = INITIAL_PACKS.filter(p => p.id !== 'gambit-pack' && p.id !== 'vantage-pack' && p.id !== targetPack.id);
        if (otherPacks.length > 0) {
          const nextPack = otherPacks[Math.floor(Math.random() * otherPacks.length)];
          setTargetPack(nextPack);
          // fetchAvailableCards will be re-triggered by the targetPack dependency
          return;
        }
      }

      setAvailableCards(available);
    } catch (error) {
      console.error("Error fetching available cards:", error);
      alert("Failed to check pack stock. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, [targetPack, packId]);

  useEffect(() => {
    fetchAvailableCards();
  }, [fetchAvailableCards]);

  const pullCards = () => {
    if (userChips < packCost) {
      alert("Not enough chips!");
      return;
    }

    if (availableCards.length === 0) {
      alert("This pack is currently sold out! All copies have been claimed.");
      return;
    }

    const pullOne = () => {
      const oddsPack = targetPack || pack;
      if (!oddsPack?.pullOdds) {
        return availableCards[Math.floor(Math.random() * availableCards.length)];
      }

      const rand = Math.random() * 100;
      let cumulative = 0;
      let selectedRarity: Rarity = Rarity.COMMON;

      const rarities = [Rarity.COMMON, Rarity.UNCOMMON, Rarity.RARE, Rarity.LEGENDARY];
      
      for (const r of rarities) {
        const odd = oddsPack.pullOdds[r] || 0;
        cumulative += odd;
        if (rand <= cumulative) {
          selectedRarity = r;
          break;
        }
      }

      const getPool = (r: Rarity) => availableCards.filter(c => c.rarity === r);

      // Implement specific fallback chain
      let pool = getPool(selectedRarity);
      
      if (pool.length === 0) {
        if (selectedRarity === Rarity.COMMON) {
          // Common out of stock → try Uncommon
          pool = getPool(Rarity.UNCOMMON);
        } else if (selectedRarity === Rarity.UNCOMMON) {
          // Uncommon out of stock → try Common
          pool = getPool(Rarity.COMMON);
        } else if (selectedRarity === Rarity.RARE) {
          // Rare out of stock → try Uncommon
          pool = getPool(Rarity.UNCOMMON);
        } else if (selectedRarity === Rarity.LEGENDARY) {
          // Legendary out of stock → try Rare
          pool = getPool(Rarity.RARE);
        }
      }

      // Chain logic: Common and Uncommon both out of stock → try Rare
      if (pool.length === 0 && (selectedRarity === Rarity.COMMON || selectedRarity === Rarity.UNCOMMON)) {
          pool = getPool(Rarity.RARE);
      }

      // Chain logic: Common, Uncommon, and Rare all out of stock → try Legendary
      if (pool.length === 0 && (selectedRarity === Rarity.COMMON || selectedRarity === Rarity.UNCOMMON || selectedRarity === Rarity.RARE)) {
          pool = getPool(Rarity.LEGENDARY);
      }

      // Final fallback: if everything is out of stock (shouldn't happen if availableCards has length > 0)
      if (pool.length === 0) {
        pool = availableCards;
      }

      return pool[Math.floor(Math.random() * pool.length)];
    };

    // Pull cards
    const newCards = Array.from({ length: count }, () => pullOne());
    setRevealedCards(newCards);
    setIsOpening(true);
    setCurrentIndex(0);
    
    // SAVE IMMEDIATELY - This deducts chips and adds cards to DB
    // This prevents free rerolls by closing the tab
    onAddCards(newCards);
  };

  const handleOpenAnother = () => {
    setIsOpening(false);
    setRevealedCards([]);
    setCurrentIndex(-1);
    // Re-roll target pack if it's a gambit pack
    if (packId === 'gambit-pack') {
      const otherPacks = INITIAL_PACKS.filter(p => p.id !== 'gambit-pack');
      const actualPack = otherPacks[Math.floor(Math.random() * otherPacks.length)];
      setTargetPack(actualPack);
    } else {
      // Refresh available cards for the same pack
      fetchAvailableCards();
    }
  };

  useEffect(() => {
    if (currentIndex >= 0 && currentIndex < revealedCards.length) {
      const card = revealedCards[currentIndex];
      if (card.rarity === Rarity.LEGENDARY) {
        setShowBurst(card.rarity);
        setTimeout(() => setShowBurst(null), 1000);
      }
    }
  }, [currentIndex, revealedCards]);

  const handleNext = () => {
    if (currentIndex < revealedCards.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setCurrentIndex(revealedCards.length); // Finished
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-navy-900 flex flex-col items-center justify-center p-6 overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-600/10 blur-[120px] rounded-full" />
      </div>

      <AnimatePresence>
        {!isOpening ? (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.2, opacity: 0 }}
            className="flex flex-col items-center gap-8"
          >
            <div className="w-64 h-96 rounded-3xl shadow-2xl shadow-indigo-500/20 border border-white/20 flex items-center justify-center relative group overflow-hidden">
                {pack?.image ? (
                  <img 
                    src={pack.image}
                    alt="Pack"
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 animate-spin-slow opacity-80" />
                )}
               <div className="absolute inset-0 card-shimmer opacity-30" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-display font-bold text-white">Ready to open?</h2>
              <p className="text-slate-400">Your destiny awaits inside this pack.</p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={onCancel}
                className="px-8 py-4 rounded-2xl font-bold text-slate-400 hover:text-white transition-colors"
              >
                Maybe later
              </button>
              <button
                onClick={pullCards}
                disabled={loading}
                className={`px-12 py-4 rounded-2xl font-bold text-lg shadow-xl transition-all ${
                  loading 
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
                    : 'bg-white text-navy-900 hover:bg-slate-200'
                }`}
              >
                {loading ? 'Checking Stock...' : 'Open Pack'}
              </button>
            </div>
          </motion.div>
        ) : (
          <div className="flex flex-col items-center gap-12 w-full max-w-4xl">
            {/* Card Reveal Area */}
            <div className="relative h-[480px] w-full flex items-center justify-center">
              <AnimatePresence mode="wait">
                {currentIndex < revealedCards.length ? (
                  <motion.div
                    key={currentIndex}
                    initial={{ rotateY: 180, scale: 0.5, opacity: 0 }}
                    animate={{ rotateY: 0, scale: 1, opacity: 1 }}
                    exit={{ x: -200, opacity: 0, rotate: -10 }}
                    transition={{ type: 'spring', damping: 15, stiffness: 100 }}
                    className="perspective-1000"
                  >
                    <Card card={revealedCards[currentIndex]} size="xl" />
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 max-h-[70vh] overflow-y-auto px-4 py-8"
                  >
                    {revealedCards.map((card, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.1 }}
                        className="flex justify-center"
                      >
                        <Card card={card} size={revealedCards.length > 3 ? "md" : "lg"} />
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Rarity Bursts */}
              <AnimatePresence>
                {showBurst && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 4, opacity: [0, 1, 0] }}
                    exit={{ opacity: 0 }}
                    className={`absolute inset-0 rounded-full blur-3xl pointer-events-none z-50 ${
                      showBurst === Rarity.LEGENDARY ? 'bg-amber-400' : 'bg-emerald-500'
                    }`}
                  />
                )}
              </AnimatePresence>
            </div>

            {/* Controls */}
            <div className="flex flex-col items-center gap-4">
              {currentIndex < revealedCards.length ? (
                <button
                  onClick={handleNext}
                  className="px-12 py-4 bg-indigo-600 text-white rounded-2xl font-bold text-lg shadow-xl hover:bg-indigo-500 transition-all"
                >
                  {currentIndex === revealedCards.length - 1 ? 'Show All' : 'Next Card'}
                </button>
              ) : (
                <div className="flex gap-4">
                   <button
                    onClick={handleOpenAnother}
                    className="px-8 py-4 bg-navy-800 text-white border border-white/10 rounded-2xl font-bold transition-all hover:bg-navy-700"
                  >
                    Open Another
                  </button>
                  <button
                    onClick={onClose}
                    className="px-12 py-4 bg-indigo-600 text-white rounded-2xl font-bold text-lg shadow-xl hover:bg-indigo-500 transition-all"
                  >
                    Done
                  </button>
                </div>
              )}
              <p className="text-slate-500 text-sm font-medium uppercase tracking-widest">
                {currentIndex < revealedCards.length ? `Card ${currentIndex + 1} of ${revealedCards.length}` : 'Pack Complete'}
              </p>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
