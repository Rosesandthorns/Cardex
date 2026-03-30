import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card, UserCard } from '../types';
import { Trophy, ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react';

interface RarePairsProps {
  /** The authenticated user's Firestore card collection */
  collection: UserCard[];
  chips: number;
  onEarnChips: (amount: number) => void;
  streak: number;
  setStreak: (updater: (prev: number) => number) => void;
  onBack: () => void;
}

export const RarePairs: React.FC<RarePairsProps> = ({
  collection,
  chips,
  onEarnChips,
  streak,
  setStreak,
  onBack,
}) => {
  const [grid, setGrid] = useState<(Card | null)[][]>([]);
  const [queue, setQueue] = useState<Card[]>([]);
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [gameState, setGameState] = useState<'playing' | 'won' | 'lost' | 'insufficient'>('playing');
  const [lastReward, setLastReward] = useState<number | null>(null);

  // NEW: Solver logic to check if a board is winnable
  const isSolvable = (initialGrid: (Card | null)[][], initialQueue: Card[]): boolean => {
    const memo = new Set<string>();

    const getRefilledState = (g: (Card | null)[][], q: Card[]) => {
      let gridCopy = g.map(row => [...row]);
      let queueCopy = [...q];

      // 1. Shift left
      for (let r = 0; r < 5; r++) {
        const rowData = gridCopy[r].filter(c => c !== null) as Card[];
        while (rowData.length < 5) rowData.push(null as any);
        gridCopy[r] = rowData;
      }
      // 2. Shift down (gravity)
      for (let c = 0; c < 5; c++) {
        const col: Card[] = [];
        for (let r = 0; r < 5; r++) {
          if (gridCopy[r][c] !== null) col.push(gridCopy[r][c] as Card);
        }
        const newCol = [...Array(5 - col.length).fill(null), ...col];
        for (let r = 0; r < 5; r++) {
          gridCopy[r][c] = newCol[r] as Card | null;
        }
      }
      // 3. Refill
      for (let r = 4; r >= 0; r--) {
        for (let c = 0; c < 5; c++) {
          if (gridCopy[r][c] === null && queueCopy.length > 0) {
            gridCopy[r][c] = queueCopy.shift()!;
          }
        }
      }
      return { grid: gridCopy, queue: queueCopy };
    };

    const solve = (g: (Card | null)[][], q: Card[]): boolean => {
      const boardEmpty = g.every(row => row.every(c => c === null));
      if (boardEmpty && q.length === 0) return true;

      const stateKey = g.flat().map(c => c ? c.name : '.').join('') + '|' + q.map(c => c.name).join('');
      if (memo.has(stateKey)) return false;
      memo.add(stateKey);

      // Find possible matches
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          const card1 = g[r][c];
          if (!card1) continue;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              const nr = r + dr, nc = c + dc;
              if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5) {
                const card2 = g[nr][nc];
                if (card2 && card2.name === card1.name) {
                  const nextState = getRefilledState(
                    g.map((row, ri) => row.map((rc, ci) => (ri === r && ci === c) || (ri === nr && ci === nc) ? null : rc)),
                    q
                  );
                  if (solve(nextState.grid, nextState.queue)) return true;
                }
              }
            }
          }
        }
      }
      return false;
    };

    return solve(initialGrid, initialQueue);
  };

  // Initialize game
  const initGame = useCallback(() => {
    try {
      console.log('[RarePairs] Initialising game. Collection size:', collection.length);

      const uniqueCards: Card[] = [];
      const seenNames = new Set<string>();

      for (const uc of collection) {
        if (!uc.card) continue;
        if (!seenNames.has(uc.card.name)) {
          uniqueCards.push(uc.card);
          seenNames.add(uc.card.name);
        }
        if (uniqueCards.length === 15) break;
      }

      if (uniqueCards.length < 15) {
        setGameState('insufficient');
        return;
      }

      let attempts = 0;
      let finalGrid: (Card | null)[][] = [];
      let finalQueue: Card[] = [];

      while (attempts < 50) {
        attempts++;
        const gameCards = [
          ...uniqueCards,
          ...uniqueCards.map(c => ({ ...c, id: c.id + '_copy_' + Math.random().toString(36).slice(2) })),
        ];

        for (let i = gameCards.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [gameCards[i], gameCards[j]] = [gameCards[j], gameCards[i]];
        }

        const testGrid: (Card | null)[][] = [];
        for (let r = 0; r < 5; r++) {
          testGrid.push(gameCards.slice(r * 5, (r + 1) * 5));
        }
        const testQueue = gameCards.slice(25);

        if (isSolvable(testGrid, testQueue)) {
          finalGrid = testGrid;
          finalQueue = testQueue;
          break;
        }
      }

      if (finalGrid.length === 0) {
        // Fallback: If 50 attempts fail, use a guaranteed simple shuffle (shouldn't really happen)
        console.warn('[RarePairs] Solver failed to find solvable board in 50 attempts.');
        // Still set fallback so game doesn't crash
        setGameState('lost');
        return;
      }

      setQueue(finalQueue);
      setGrid(finalGrid);
      setGameState('playing');
      setSelected(null);
      setLastReward(null);

      console.log(`[RarePairs] Game board initialised (Solvable: Yes) after ${attempts} attempts.`);
    } catch (error) {
      console.error('[RarePairs] Critical error during init:', error);
      alert('Failed to load minigame. Please try again.');
    }
  }, [collection]);

  useEffect(() => {
    initGame();
  }, [initGame]);

  const isAdjacent = (r1: number, c1: number, r2: number, c2: number) =>
    Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1 && !(r1 === r2 && c1 === c2);

  const checkMatchesCount = (currentGrid: (Card | null)[][]) => {
    let count = 0;
    const seenMatches = new Set<string>();
    
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const card = currentGrid[r][c];
        if (!card) continue;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5) {
              const other = currentGrid[nr][nc];
              if (other && other.name === card.name) {
                const matchKey = [card.id, other.id].sort().join('-');
                if (!seenMatches.has(matchKey)) {
                  seenMatches.add(matchKey);
                  count++;
                }
              }
            }
          }
        }
      }
    }
    return count;
  };

  const checkMatchesExist = (currentGrid: (Card | null)[][]) => {
    return checkMatchesCount(currentGrid) > 0;
  };


  const handleCardClick = (r: number, c: number) => {
    if (gameState !== 'playing') return;
    const card = grid[r][c];
    if (!card) return;

    if (!selected) {
      setSelected({ r, c });
      return;
    }

    if (selected.r === r && selected.c === c) {
      setSelected(null);
      return;
    }

    const selectedCard = grid[selected.r][selected.c];
    if (selectedCard && selectedCard.name === card.name && isAdjacent(selected.r, selected.c, r, c)) {
      // Matched pair!
      console.log('[RarePairs] Matched pair:', card.name);
      const newGrid = grid.map(row => [...row]);
      newGrid[selected.r][selected.c] = null;
      newGrid[r][c] = null;
      processGravityAndRefill(newGrid);
    } else {
      // Not a valid match — move selection
      setSelected({ r, c });
    }
  };

  const processGravityAndRefill = (targetGrid: (Card | null)[][]) => {
    let currentGrid = targetGrid;
    let currentQueue = [...queue];

    // 1. Shift left within each row (compact non-null to the left)
    for (let r = 0; r < 5; r++) {
      const row = currentGrid[r].filter(c => c !== null) as Card[];
      while (row.length < 5) row.push(null as any);
      currentGrid[r] = row;
    }

    // 2. Shift down within each column (gravity)
    for (let c = 0; c < 5; c++) {
      const col: Card[] = [];
      for (let r = 0; r < 5; r++) {
        if (currentGrid[r][c] !== null) col.push(currentGrid[r][c] as Card);
      }
      const newCol = [...Array(5 - col.length).fill(null), ...col];
      for (let r = 0; r < 5; r++) {
        currentGrid[r][c] = newCol[r] as Card | null;
      }
    }

    // 3. Refill empty spots from the queue (bottom-to-top, left-to-right)
    for (let r = 4; r >= 0; r--) {
      for (let c = 0; c < 5; c++) {
        if (currentGrid[r][c] === null && currentQueue.length > 0) {
          currentGrid[r][c] = currentQueue.shift()!;
        }
      }
    }

    // Board solvability is guaranteed at START.
    // We no longer reshuffle during play per user requirements.
    const boardEmpty = currentGrid.every(row => row.every(c => c === null));
    const matchesAfterRefill = checkMatchesCount(currentGrid);

    setGrid(currentGrid);
    setQueue(currentQueue);
    setSelected(null);

    console.log('[RarePairs] After refill. Remaining queue:', currentQueue.length, 'Matches:', matchesAfterRefill);

    // Check end conditions
    if (boardEmpty && currentQueue.length === 0) {
      handleWin();
    } else if (matchesAfterRefill === 0) {
      handleLoss();
    }
  };

  const handleWin = () => {
    try {
      const reward = 10 + 10 * streak;
      console.log(`[RarePairs] WIN! Streak: ${streak}, reward: ${reward} chips`);
      onEarnChips(reward);
      setStreak(prev => prev + 1);
      setLastReward(reward);
      setGameState('won');
    } catch (err) {
      console.error('[RarePairs] Error handling win:', err);
      // Still show won state to user but log error
      setGameState('won');
    }
  };

  const handleLoss = () => {
    console.log('[RarePairs] LOSS — no valid adjacent matches remaining. Streak reset.');
    setStreak(() => 0);
    setGameState('lost');
  };

  /* ---- Insufficient cards screen ---- */
  if (gameState === 'insufficient') {
    const uniqueCount = new Set(collection.map(uc => uc.card?.name).filter(Boolean)).size;
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center space-y-6 min-h-[60vh]">
        <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center">
          <AlertCircle className="w-10 h-10 text-rose-500" />
        </div>
        <h2 className="text-3xl font-display font-bold">Not Enough Cards</h2>
        <p className="text-zinc-400 max-w-sm">
          You need at least <span className="text-white font-bold">15 unique cards</span> in your
          collection to play Rare Pairs.
          <br />
          You currently have <span className="text-indigo-400 font-bold">{uniqueCount}</span> unique card
          {uniqueCount !== 1 ? 's' : ''}.
        </p>
        <button
          onClick={onBack}
          className="px-8 py-3 bg-white text-black font-bold rounded-full hover:bg-zinc-200 transition-colors"
        >
          Back to Collection
        </button>
      </div>
    );
  }

  /* ---- Main game ---- */
  return (
    <div className="flex flex-col items-center space-y-8">
      {/* Header row */}
      <div className="w-full flex flex-col md:flex-row justify-between items-center gap-6 mb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors group"
        >
          <ArrowLeft size={20} className="transition-transform group-hover:-translate-x-1" />
          <span>Back to Collection</span>
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

      {/* Board */}
      <div className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-[40px] blur-2xl opacity-50 group-hover:opacity-100 transition duration-1000" />
        <div className="relative grid grid-cols-5 gap-3 p-6 glass-panel rounded-[32px] bg-black/40 border border-white/5 backdrop-blur-xl">
          {grid.map((row, r) =>
            row.map((card, c) => (
              <div key={`${r}-${c}`} className="w-20 h-28 relative">
                <AnimatePresence mode="popLayout">
                  {card && (
                    <motion.div
                      layoutId={card.id}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      whileHover={{ scale: 1.05, y: -2 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleCardClick(r, c)}
                      className={`w-full h-full rounded-xl overflow-hidden border-2 transition-all duration-300 cursor-pointer bg-zinc-950 flex flex-col ${
                        selected?.r === r && selected.c === c
                          ? 'border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.35)] z-10'
                          : 'border-white/10 hover:border-white/30'
                      }`}
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
                        <p className="text-[9px] font-bold text-white truncate text-center uppercase tracking-tight">
                          {card.name}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))
          )}
        </div>

        {/* Game-over overlays */}
        <AnimatePresence>
          {gameState === 'won' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl rounded-[32px] p-8 text-center border border-indigo-500/30"
            >
              <motion.div
                initial={{ scale: 0.5, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                className="w-24 h-24 bg-indigo-500/10 rounded-full flex items-center justify-center mb-6"
              >
                <Trophy className="w-12 h-12 text-indigo-400" />
              </motion.div>
              <h2 className="text-4xl font-display font-bold text-white mb-2">BOARD CLEARED</h2>
              {lastReward && (
                <div className="flex items-center gap-2 justify-center mb-8">
                  <span className="text-indigo-400 font-mono text-2xl font-bold">+{lastReward}</span>
                  <span className="text-zinc-500 font-mono text-sm uppercase tracking-widest">Chips</span>
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-4 w-full max-w-[280px]">
                <button
                  onClick={initGame}
                  className="flex-1 py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-500 transition-all active:scale-95"
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
              <p className="text-zinc-400 mb-8 max-w-[200px] mx-auto">
                No matching adjacent pairs remaining.
              </p>
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

      {/* Instructions */}
      <div className="max-w-md text-center">
        <div className="glass-panel px-6 py-4 rounded-2xl border border-white/5 bg-white/2">
          <p className="text-zinc-500 text-sm leading-relaxed">
            Select two <span className="text-white font-bold">matching</span> cards that are{' '}
            <span className="text-white font-bold">touching</span> (including diagonals) to clear them.
            Clear all 30 cards to earn chips!
          </p>
        </div>
      </div>
    </div>
  );
};
