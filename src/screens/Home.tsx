import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ChipDisplay } from '../components/ChipDisplay';
import { INITIAL_PACKS } from '../constants';
import { Quest, UserProfile } from '../types';
import { TrendingUp, Zap, Gift, CheckCircle } from 'lucide-react';
import { db } from '../firebase';
import { doc, updateDoc, addDoc, collection, increment } from 'firebase/firestore';
import { getDailyBonusMultiplier, getQuestRewardMultiplier, getPackPrice, getCurrentEvent, EventType } from '../utils/events';

interface HomeProps {
  user: UserProfile;
  quests: Quest[];
  onOpenPack: (packId: string, cost: number, count?: number) => void;
}

export const Home: React.FC<HomeProps> = ({ user, quests, onOpenPack }) => {
  const [claiming, setClaiming] = useState(false);

  const getDailyRewardInfo = () => {
    const streak = user.dailyLoginStreak || 0;
    const lastClaimed = user.dailyLoginLastClaimed ? new Date(user.dailyLoginLastClaimed) : null;
    const now = new Date();
    
    let currentStreak = streak;
    if (!lastClaimed) {
      currentStreak = 1;
    } else {
      const diffTime = now.setHours(0,0,0,0) - lastClaimed.setHours(0,0,0,0);
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        currentStreak = Math.min(streak + 1, 5);
      } else if (diffDays > 1) {
        currentStreak = 1;
      }
    }
    
    const baseAmount = currentStreak * 100;
    
    // Creator bonus logic
    const creatorIdentifier = `@${user.username}`;
    const packsCreated = INITIAL_PACKS.filter(p => p.creator?.toLowerCase() === creatorIdentifier.toLowerCase()).length;
    const creatorBonus = packsCreated * 0.10;
    
    const baseMultiplier = getDailyBonusMultiplier();
    const multiplier = baseMultiplier + creatorBonus;
    
    return {
      amount: Math.floor(baseAmount * multiplier),
      streak: currentStreak,
      multiplier
    };
  };

  const canClaimDaily = () => {
    if (!user.dailyLoginLastClaimed) return true;
    const lastClaimed = new Date(user.dailyLoginLastClaimed);
    const now = new Date();
    return now.toDateString() !== lastClaimed.toDateString();
  };

  const handleClaimDaily = async () => {
    if (!canClaimDaily() || claiming) return;
    setClaiming(true);
    try {
      const { amount, streak, multiplier } = getDailyRewardInfo();
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        chips: increment(amount),
        dailyLoginLastClaimed: new Date().toISOString(),
        dailyLoginStreak: streak
      });
      
      await addDoc(collection(db, 'activities'), {
        uid: user.uid,
        text: `Claimed daily reward (Day ${streak}): +${amount} Chips${multiplier > 1 ? ' (With Bonuses!)' : ''}`,
        type: 'quest',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error claiming daily reward:", error);
    } finally {
      setClaiming(false);
    }
  };

  const handleClaimQuest = async (quest: Quest) => {
    if (!quest.completed || quest.claimed) return;
    try {
      const multiplier = getQuestRewardMultiplier();
      const reward = quest.reward * multiplier;
      const userRef = doc(db, 'users', user.uid);
      const questRef = doc(db, 'quests', quest.id);
      
      await updateDoc(userRef, {
        chips: increment(reward),
        xp: increment(quest.reward / 2)
      });
      
      await updateDoc(questRef, {
        claimed: true
      });
 
      await addDoc(collection(db, 'activities'), {
        uid: user.uid,
        text: `Completed quest: ${quest.title} (+${reward} Chips${multiplier > 1 ? ' - Money Monday 2x!' : ''})`,
        type: 'quest',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error claiming quest reward:", error);
    }
  };

  return (
    <div className="space-y-10">
      {/* News Ticker */}
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-3 overflow-hidden">
        <Zap size={16} className="text-emerald-400 animate-pulse shrink-0" />
        <p className="text-sm font-medium text-emerald-200 whitespace-nowrap">
          Welcome back, <span className="font-bold">{user.displayName}</span>! New packs rotating in soon.
        </p>
      </div>

      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-zinc-900 rounded-3xl p-8 border border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-3xl rounded-full -mr-20 -mt-20 group-hover:bg-emerald-500/10 transition-colors duration-500" />
          
          <div className="relative z-10">
            <h3 className="text-zinc-500 text-sm font-bold uppercase tracking-widest mb-2">Current Balance</h3>
            <ChipDisplay amount={user.chips} size="lg" />
            
            <div className="mt-8 flex items-center gap-6">
              <div className="flex flex-col">
                <span className="text-xs text-zinc-500 font-bold uppercase tracking-tighter">Daily Reward</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-sm font-bold ${canClaimDaily() ? 'text-emerald-400' : 'text-zinc-500'}`}>
                    {canClaimDaily() ? 'Available Now' : 'Claimed Today'}
                  </span>
                </div>
              </div>
              <button 
                onClick={handleClaimDaily}
                disabled={!canClaimDaily() || claiming}
                className={`px-6 py-2 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${
                  canClaimDaily() 
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20' 
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                }`}
              >
                {claiming ? <Zap size={16} className="animate-spin" /> : <Gift size={16} />}
                {canClaimDaily() ? `Claim ${getDailyRewardInfo().amount} Chips` : 'Come back tomorrow'}
              </button>
            </div>
            {user.dailyLoginStreak && (
              <div className="mt-4 flex gap-1">
                {[1, 2, 3, 4, 5].map(day => (
                  <div 
                    key={day} 
                    className={`h-1 flex-1 rounded-full ${day <= (user.dailyLoginStreak || 0) ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                  />
                ))}
                <span className="text-[10px] text-zinc-500 font-bold uppercase ml-2">Day {user.dailyLoginStreak} Streak</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-zinc-900 rounded-3xl p-8 border border-white/5">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-zinc-500 text-sm font-bold uppercase tracking-widest">Active Quests</h3>
            <TrendingUp size={16} className="text-zinc-500" />
          </div>
          <div className="space-y-6">
            {quests.length > 0 ? (
              quests.sort((a, b) => {
                const order = { easy: 0, medium: 1, hard: 2 };
                return (order[a.difficulty as keyof typeof order] || 0) - (order[b.difficulty as keyof typeof order] || 0);
              }).map(quest => (
                <div key={quest.id} className="space-y-2 p-4 bg-white/5 rounded-2xl border border-white/5">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                        quest.difficulty === 'easy' ? 'bg-emerald-500/20 text-emerald-400' :
                        quest.difficulty === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-rose-500/20 text-rose-400'
                      }`}>
                        {quest.difficulty}
                      </span>
                      <p className="font-medium text-zinc-200">{quest.title}</p>
                    </div>
                    {quest.claimed ? (
                      <div className="flex items-center gap-1 text-emerald-500 text-xs font-bold uppercase">
                        <CheckCircle size={14} />
                        <span>Completed</span>
                      </div>
                    ) : (
                      <button 
                        disabled={!quest.completed}
                        onClick={() => handleClaimQuest(quest)}
                        className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-all ${
                          quest.completed 
                            ? 'bg-emerald-500 text-black hover:bg-emerald-400 cursor-pointer shadow-lg shadow-emerald-500/20' 
                            : 'text-zinc-500 bg-zinc-800/50'
                        }`}
                      >
                        {quest.completed ? 'Claim Reward' : `+${quest.reward} Chips`}
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min((quest.progress / quest.total) * 100, 100)}%` }}
                        className={`h-full rounded-full ${quest.completed ? 'bg-emerald-500' : 'bg-emerald-500/40'}`}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                      <span>{quest.completed ? 'Quest Completed' : 'Progress'}</span>
                      <span>{Math.min(quest.progress, quest.total)} / {quest.total}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-zinc-500 text-sm text-center py-4">No active quests</p>
            )}
          </div>
        </div>
      </div>

      {/* Featured Packs */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-display font-bold text-white">Featured Packs</h2>
          <button className="text-emerald-400 text-sm font-bold hover:text-emerald-300 transition-colors">View All</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {INITIAL_PACKS.map(pack => {
            const price = getPackPrice(pack.price);
            const isDiscounted = price < pack.price;
            const isGambit = pack.id === 'gambit-pack';
            
            return (
              <motion.div
                key={pack.id}
                whileHover={{ y: -8 }}
                className="bg-zinc-900 rounded-3xl border border-white/5 overflow-hidden group"
              >
                <div className="h-48 relative p-8 flex flex-col justify-end overflow-hidden">
                  {pack.image ? (
                    <img 
                      src={pack.image}
                      alt={pack.name}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 animate-spin-slow opacity-80" />
                  )}
                  
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/80 to-transparent" />
                  <h3 className="text-2xl font-display font-bold text-white drop-shadow-lg relative z-10">{pack.name}</h3>
                </div>
                <div className="p-6">
                  {!isGambit && pack.creator && (
                    <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-1">
                      By {pack.creator}
                    </p>
                  )}
                  <p className="text-zinc-400 text-sm mb-6 line-clamp-2">{pack.description}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onOpenPack(pack.id, price, 1)}
                      disabled={user.chips < price}
                      className={`flex-1 py-3 rounded-2xl font-bold flex flex-col items-center justify-center transition-all ${
                        user.chips >= price
                          ? 'bg-white text-black hover:bg-emerald-400 shadow-xl'
                          : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                      }`}
                    >
                      <span className="text-sm">Open 1x</span>
                      <ChipDisplay amount={price} size="sm" className={user.chips < price ? 'text-zinc-500' : 'text-amber-600'} />
                    </button>
                    <button
                      onClick={() => onOpenPack(pack.id, Math.floor(price * 2.5), 3)}
                      disabled={user.chips < Math.floor(price * 2.5)}
                      className={`flex-1 py-3 rounded-2xl font-bold flex flex-col items-center justify-center transition-all ${
                        user.chips >= Math.floor(price * 2.5)
                          ? 'bg-white text-black hover:bg-emerald-400 shadow-xl'
                          : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                      }`}
                    >
                      <span className="text-sm">Open 3x</span>
                      <div className="flex items-center gap-1">
                        <ChipDisplay amount={Math.floor(price * 2.5)} size="sm" className={user.chips < Math.floor(price * 2.5) ? 'text-zinc-500' : 'text-amber-600'} />
                      </div>
                    </button>
                  </div>
                  {isDiscounted && (
                    <p className="text-[10px] text-amber-400 font-bold mt-2 text-center uppercase tracking-widest animate-pulse">
                      ✨ Gatcha Weekend: 25% OFF!
                    </p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
