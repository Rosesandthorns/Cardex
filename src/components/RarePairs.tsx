import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '../types';
import { Trophy, ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react';

interface RarePairsProps {
  collection: Card[];
  balance: number;
  setBalance: (updater: (prev: number) => number | any) => void;
  streak: number;
  setStreak: (updater: (prev: number) => number | any) => void;
  onBack: () => void;
}

export const RarePairs: React.FC<RarePairsProps> = ({
  collection,
  balance,
  setBalance,
  streak,
  setStreak,
  onBack
}) => {
  const [grid, setGrid] = useState<(Card | null)[][]>([]);
  const [queue, setQueue] = useState<Card[]>([]);
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [gameState, setGameState] = useState<'playing' | 'won' | 'lost' | 'insufficient'>('playing');
  const [lastReward, setLastReward] = useState<number | null>(null);

  // Initialize game
  const initGame = useCallback(() => {
    // Need at least 15 unique cards (by name)
    const uniqueCards: Card[] = [];
    const seenNames = new Set<string>();
    
    for (const card of collection) {
      if (!seenNames.has(card.name)) {
        uniqueCards.push(card);
        seenNames.add(card.name);
      }
      if (uniqueCards.length === 15) break;
    }

    if (uniqueCards.length < 15) {
      setGameState('insufficient');
      return;
    }

    // Duplicate to 30
    const gameCards = [...uniqueCards, ...uniqueCards.map(c => ({ ...c, gameId: Math.random() }))];
    
    // Shuffle
    for (let i = gameCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [gameCards[i], gameCards[j]] = [gameCards[j], gameCards[i]];
    }

    // Fill 5x5 grid
    const newGrid: (Card | null)[][] = [];
    for (let r = 0; r < 5; r++) {
      newGrid.push(gameCards.slice(r * 5, (r + 1) * 5));
    }

    // Remaining 5 in queue
    setQueue(gameCards.slice(25));
    setGrid(newGrid);
    setGameState('playing');
    setSelected(null);
    setLastReward(null);
  }, [collection]);

  useEffect(() => {
    initGame();
  }, [initGame]);

  const isAdjacent = (r1: number, c1: number, r2: number, c2: number) => {
    return Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1 && !(r1 === r2 && c1 === c2);
  };

  const checkMatchesExist = (currentGrid: (Card | null)[][]) => {
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const card = currentGrid[r][c];
        if (!card) continue;
        
        // Check 8 directions
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5) {
              const other = currentGrid[nr][nc];
              if (other && other.name === card.name) return true;
            }
          }
        }
      }
    }
    return false;
  };

  const handleCardClick = (r: number, c: number) => {
    if (gameState !== 'playing') return;
    const card = grid[r][c];
    if (!card) return;

    if (!selected) {
      setSelected({ r, c });
    } else {
      if (selected.r === r && selected.c === c) {
        setSelected(null);
        return;
      }

      const selectedCard = grid[selected.r][selected.c];
      if (selectedCard && selectedCard.name === card.name && isAdjacent(selected.r, selected.c, r, c)) {
        // Match!
        const newGrid = grid.map(row => [...row]);
        newGrid[selected.r][selected.c] = null;
        newGrid[r][c] = null;
        
        // Process gravity and refill
        processGravityAndRefill(newGrid);
      } else {
        // Not a match or not adjacent
        setSelected({ r, c });
      }
    }
  };

  const processGravityAndRefill = (targetGrid: (Card | null)[][]) => {
    let currentGrid = targetGrid;
    let currentQueue = [...queue];

    // 1. Shift Left in each row
    for (let r = 0; r < 5; r++) {
      const row = currentGrid[r].filter(c => c !== null);
      while (row.length < 5) row.push(null);
      currentGrid[r] = row;
    }

    // 2. Shift Down in each column
    for (let c = 0; c < 5; c++) {
      const col = [];
      for (let r = 0; r < 5; r++) {
        if (currentGrid[r][c] !== null) col.push(currentGrid[r][c]);
      }
      const newCol = [...Array(5 - col.length).fill(null), ...col];
      for (let r = 0; r < 5; r++) {
        currentGrid[r][c] = (newCol[r] as Card | null);
      }
    }

    // 3. Refill from queue 
    // Fill empty spots (nulls). Since gravity is bottom-left, empty spots are usually top-right.
    // We fill from bottom to top, left to right for consistency.
    for (let r = 4; r >= 0; r--) {
      for (let c = 0; c < 5; c++) {
        if (currentGrid[r][c] === null && currentQueue.length > 0) {
          currentGrid[r][c] = currentQueue.shift()!;
        }
      }
    }

    setGrid(currentGrid);
    setQueue(currentQueue);
    setSelected(null);

    // Check end conditions
    const boardEmpty = currentGrid.every(row => row.every(c => c === null));
    if (boardEmpty && currentQueue.length === 0) {
      handleWin();
    } else if (!checkMatchesExist(currentGrid)) {
      handleLoss();
    }
  };

  const handleWin = () => {
    const reward = 10 + (10 * streak);
    setBalance(prev => prev + reward);
    setStreak(prev => prev + 1);
    setLastReward(reward);
    setGameState('won');
  };

  const handleLoss = () => {
    setStreak(() => 0);
    setGameState('lost');
  };

  if (gameState === 'insufficient') {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center space-y-6 min-h-[60vh]">
        <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center">
          <AlertCircle className="w-10 h-10 text-rose-500" />
        </div>
        <h2 className="text-3xl font-display font-bold">Not Enough Cards</h2>
        <p className="text-zinc-400 max-w-sm">
          You need at least 15 unique cards in your collection to play Rare Pairs. 
          Current unique cards: {new Set(collection.map(c => c.name)).size}
        </p>
        <button
          onClick={onBack}
          className="px-8 py-3 bg-white text-black font-bold rounded-full hover:bg-zinc-200 transition-colors"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center space-y-8">
      <div className="w-full flex flex-col md:flex-row justify-between items-center gap-6 mb-4">
        <button onClick={onBack} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors group">
          <ArrowLeft size={20} className="transition-transform group-hover:-translate-x-1" />
          <span>Back to Vantage</span>
        </button>
        <div className="flex gap-4">
          <div className="glass-panel px-6 py-2 rounded-2xl flex flex-col items-center min-w-[100px]">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Streak</span>
            <span className="text-2xl font-bold text-emerald-400">{streak}</span>
          </div>
          <div className="glass-panel px-6 py-2 rounded-2xl flex flex-col items-center min-w-[100px]">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Queue</span>
            <span className="text-2xl font-bold text-blue-400">{queue.length}</span>
          </div>
        </div>
      </div>

      <div className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 to-blue-500/20 rounded-[40px] blur-2xl opacity-50 group-hover:opacity-100 transition duration-1000"></div>
        <div className="relative grid grid-cols-5 gap-3 p-6 glass-panel rounded-[32px] bg-black/40 border border-white/5 backdrop-blur-xl">
          {grid.map((row, r) => 
            row.map((card, c) => (
              <div 
                key={`${r}-${c}`}
                className="w-20 h-28 relative"
              >
                <AnimatePresence mode="popLayout">
                  {card && (
                    <motion.div
                      layoutId={card.id + (card as any).gameId}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ 
                        scale: 1, 
                        opacity: 1,
                        y: 0
                      }}
                      exit={{ scale: 0.5, opacity: 0, rotate: selected?.r === r && selected.c === c ? 0 : 10 }}
                      whileHover={{ scale: 1.05, y: -2 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleCardClick(r, c)}
                      className={`w-full h-full rounded-xl overflow-hidden border-2 transition-all duration-300 cursor-pointer bg-zinc-950 flex flex-col ${selected?.r === r && selected.c === c ? 'border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)] z-10' : 'border-white/10 hover:border-white/30'}`}
                    >
                      <div className="flex-1 overflow-hidden relative">
                        <img 
                          src={card.image} 
                          alt={card.name} 
                          className="w-full h-full object-cover pointer-events-none"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="p-1 px-2 bg-black/80 backdrop-blur-sm">
                        <p className="text-[9px] font-bold text-white truncate text-center uppercase tracking-tight">{card.name}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))
          )}
        </div>

        {/* Game Over Overlays */}
        <AnimatePresence>
          {gameState === 'won' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl rounded-[32px] p-8 text-center border border-emerald-500/30"
            >
              <motion.div
                initial={{ scale: 0.5, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6"
              >
                <Trophy className="w-12 h-12 text-emerald-400" />
              </motion.div>
              <h2 className="text-4xl font-display font-bold text-white mb-2">BOARD CLEARED</h2>
              {lastReward && (
                <div className="flex items-center gap-2 justify-center mb-8">
                  <span className="text-emerald-400 font-mono text-2xl font-bold">+{lastReward}</span>
                  <span className="text-zinc-500 font-mono text-sm uppercase tracking-widest">Chips</span>
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-4 w-full max-w-[280px]">
                <button
                  onClick={initGame}
                  className="flex-1 py-4 bg-emerald-500 text-black font-bold rounded-2xl hover:bg-emerald-400 transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
                >
                  Play Again
                </button>
                <button
                  onClick={onBack}
                  className="flex-1 py-4 bg-white/10 text-white font-bold rounded-2xl hover:bg-white/20 transition-all active:scale-95"
                >
                  Exit
                </button>
              </div>
            </motion.div>
          )}

          {gameState === 'lost' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl rounded-[32px] p-8 text-center border border-rose-500/30"
            >
              <div className="w-24 h-24 bg-rose-500/10 rounded-full flex items-center justify-center mb-6">
                <AlertCircle className="w-12 h-12 text-rose-500" />
              </div>
              <h2 className="text-4xl font-display font-bold text-white mb-2">GAME OVER</h2>
              <p className="text-zinc-400 mb-8 max-w-[200px] mx-auto">No matching adjacent pairs remaining.</p>
              <div className="flex flex-col sm:flex-row gap-4 w-full max-w-[280px]">
                <button
                  onClick={initGame}
                  className="flex-1 py-4 bg-white text-black font-bold rounded-2xl hover:bg-zinc-200 transition-all active:scale-95"
                >
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw size={20} />
                    <span>Try Again</span>
                  </div>
                </button>
                <button
                  onClick={onBack}
                  className="flex-1 py-4 bg-white/10 text-white font-bold rounded-2xl hover:bg-white/20 transition-all active:scale-95"
                >
                  Exit
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="max-w-md text-center">
        <div className="glass-panel px-6 py-4 rounded-2xl border border-white/5 bg-white/2">
          <p className="text-zinc-500 text-sm leading-relaxed">
            Select two <span className="text-white font-bold">matching</span> cards that are <span className="text-white font-bold">touching</span> (including diagonals) to clear them. Clear all 30 cards to earn chips!
          </p>
        </div>
      </div>
    </div>
  );
};
