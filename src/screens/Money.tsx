import React, { useState, useRef, useEffect } from 'react';
import { Coins, MousePointer2, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../firebase';
import { doc, updateDoc, increment } from 'firebase/firestore';
import { UserProfile } from '../types';

interface MoneyProps {
  user: UserProfile;
}

export const Money: React.FC<MoneyProps> = ({ user }) => {
  const [clicks, setClicks] = useState(0);
  const [showReward, setShowReward] = useState(false);
  const [isBot, setIsBot] = useState(false);
  
  // Anti-clicker refs
  const lastClickTime = useRef<number>(0);
  const clickIntervals = useRef<number[]>([]);
  const clickCount = useRef<number>(0);

  const handleClick = async () => {
    const now = Date.now();
    const interval = now - lastClickTime.current;
    
    // 1. Check for extremely fast clicking (less than 60ms)
    if (interval < 60 && lastClickTime.current !== 0) {
      setIsBot(true);
      lastClickTime.current = now;
      return;
    }

    // 2. Check for suspicious consistency
    if (lastClickTime.current !== 0) {
      clickIntervals.current.push(interval);
      if (clickIntervals.current.length > 15) {
        clickIntervals.current.shift();
      }

      if (clickIntervals.current.length === 15) {
        const allSame = clickIntervals.current.every(val => Math.abs(val - clickIntervals.current[0]) < 2);
        if (allSame) {
          setIsBot(true);
          lastClickTime.current = now;
          return;
        }
      }
    }

    lastClickTime.current = now;

    // If bot detected, we just return silently without incrementing
    if (isBot) return;

    clickCount.current += 1;
    setClicks(prev => (prev + 1) % 10);

    if (clickCount.current >= 10) {
      clickCount.current = 0;
      
      const currentHour = new Date().toISOString().slice(0, 13);
      const hourlyRecord = JSON.parse(localStorage.getItem(`moneyTab_${user.uid}`) || '{"hour": "", "amount": 0}');
      
      if (hourlyRecord.hour !== currentHour) {
        hourlyRecord.hour = currentHour;
        hourlyRecord.amount = 0;
      }
      
      if (hourlyRecord.amount >= 300) {
        alert('You have reached the maximum 300 chips per hour limit. Take a break!');
        return;
      }
      
      hourlyRecord.amount += 1;
      localStorage.setItem(`moneyTab_${user.uid}`, JSON.stringify(hourlyRecord));

      // Grant reward
      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          chips: increment(1)
        });
        
        setShowReward(true);
        setTimeout(() => setShowReward(false), 1000);
      } catch (error) {
        console.error('Error granting token:', error);
      }
    }
  };

  // Gradually recover from bot detection if they slow down/stop
  useEffect(() => {
    if (isBot) {
      const timer = setTimeout(() => setIsBot(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isBot]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-display font-bold text-white">Token Generator</h2>
        <p className="text-slate-400">Click the button 10 times to earn 1 Chip</p>
      </div>

      <div className="relative">
        <AnimatePresence>
          {showReward && (
            <motion.div
              initial={{ opacity: 0, y: 0, scale: 0.5 }}
              animate={{ opacity: 1, y: -100, scale: 1.5 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <div className="flex items-center gap-2 text-amber-400 font-bold text-2xl">
                <Coins size={24} />
                <span>+1</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleClick}
          className="w-48 h-48 rounded-full flex flex-col items-center justify-center gap-4 shadow-2xl transition-all duration-300 bg-gradient-to-br from-indigo-600 to-purple-700 border-4 border-white/10 text-white hover:shadow-indigo-500/40"
        >
          <div className="relative">
            <MousePointer2 size={48} />
            <div className="absolute -top-2 -right-2 w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center text-xs font-bold text-navy-900 border-2 border-white/20">
              {clicks}
            </div>
          </div>
          <span className="font-bold uppercase tracking-widest text-sm">Generate</span>
        </motion.button>
      </div>

      <div className="w-64 h-2 bg-navy-800 rounded-full overflow-hidden border border-white/5">
        <motion.div 
          className="h-full bg-indigo-500"
          initial={{ width: 0 }}
          animate={{ width: `${(clicks / 10) * 100}%` }}
        />
      </div>
    </div>
  );
};
