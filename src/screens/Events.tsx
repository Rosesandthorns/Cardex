import React from 'react';
import { motion } from 'motion/react';
import { Calendar as CalendarIcon, Info, Zap, Tag, Gift, RefreshCw } from 'lucide-react';
import { getESTDate, EventType } from '../utils/events';

export const Events: React.FC = () => {
  const estDate = getESTDate();
  const currentYear = estDate.getFullYear();
  const currentMonth = estDate.getMonth();
  const currentDay = estDate.getDate();

  const months = [
    { year: currentYear, month: currentMonth },
    { year: currentMonth === 11 ? currentYear + 1 : currentYear, month: (currentMonth + 1) % 12 }
  ];

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const getEventForDay = (year: number, month: number, day: number) => {
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 1) return EventType.MONEY_MONDAY;
    if (dayOfWeek === 4) return EventType.MARKETPLACE_CELEBRATION;
    if (dayOfWeek === 0 || dayOfWeek === 6) return EventType.GATCHA_WEEKEND;
    return EventType.NONE;
  };

  const getPackRotationGroup = (year: number, month: number, day: number) => {
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay();
    
    // Only Tuesdays (2) and Fridays (5) have rotations
    if (dayOfWeek !== 2 && dayOfWeek !== 5) return null;

    // We'll use a reference date to calculate the group cycle
    // Reference: March 3, 2026 (Tuesday) was Group A
    const refDate = new Date(2026, 2, 3);
    const diffTime = date.getTime() - refDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return null;

    // The cycle repeats every 14 days (2 weeks)
    // Tue (0), Fri (3), Tue (7), Fri (10)
    const dayInCycle = diffDays % 14;
    
    if (dayInCycle === 0) return 'A';
    if (dayInCycle === 3) return 'B';
    if (dayInCycle === 7) return 'C';
    if (dayInCycle === 10) return 'D';
    
    return null;
  };

  return (
    <div className="space-y-10 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-4xl font-display font-bold text-white mb-2">Event Calendar</h2>
          <p className="text-zinc-400">Stay updated with weekly bonuses and special celebrations. All times in EST.</p>
        </div>
        <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
            <CalendarIcon size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Current Time (EST)</p>
            <p className="text-lg font-mono font-bold text-white">
              {estDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
            </p>
          </div>
        </div>
      </div>

      {/* Event Legend */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 flex gap-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center text-black shrink-0">
            <Gift size={20} />
          </div>
          <div>
            <h4 className="font-bold text-emerald-400">Money Monday</h4>
            <p className="text-xs text-emerald-500/70 mt-1">3x Daily Bonus & 2x Quest Rewards</p>
          </div>
        </div>
        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-6 flex gap-4">
          <div className="w-10 h-10 rounded-lg bg-indigo-500 flex items-center justify-center text-white shrink-0">
            <Tag size={20} />
          </div>
          <div>
            <h4 className="font-bold text-indigo-400">Marketplace Celebration</h4>
            <p className="text-xs text-indigo-500/70 mt-1">Marketplace Tax cut in half (2.5%)</p>
          </div>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 flex gap-4">
          <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center text-black shrink-0">
            <Zap size={20} />
          </div>
          <div>
            <h4 className="font-bold text-amber-400">Gatcha Weekend</h4>
            <p className="text-xs text-amber-500/70 mt-1">All Packs at 75% Price</p>
          </div>
        </div>
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 flex gap-4">
          <div className="w-10 h-10 rounded-lg bg-rose-500 flex items-center justify-center text-white shrink-0">
            <RefreshCw size={20} />
          </div>
          <div>
            <h4 className="font-bold text-rose-400">Pack Rotation</h4>
            <p className="text-xs text-rose-500/70 mt-1">New Packs rotate on Tue & Fri</p>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {months.map(({ year, month }, mIdx) => {
          const daysInMonth = getDaysInMonth(year, month);
          const firstDay = getFirstDayOfMonth(year, month);
          const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
          const blanks = Array.from({ length: firstDay }, (_, i) => i);

          return (
            <div key={`${year}-${month}`} className="bg-zinc-900 rounded-[32px] border border-white/5 p-8">
              <h3 className="text-2xl font-display font-bold text-white mb-8 flex items-center justify-between">
                {monthNames[month]} {year}
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                  {mIdx === 0 ? 'Current Month' : 'Next Month'}
                </span>
              </h3>

              <div className="grid grid-cols-7 gap-2 mb-4">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <div key={d} className="text-center text-[10px] font-bold text-zinc-500 uppercase tracking-widest py-2">
                    {d}
                  </div>
                ))}
                
                {blanks.map(b => <div key={`blank-${b}`} />)}
                
                {days.map(day => {
                  const event = getEventForDay(year, month, day);
                  const rotationGroup = getPackRotationGroup(year, month, day);
                  const isToday = mIdx === 0 && day === currentDay;
                  const isPast = mIdx === 0 && day < currentDay;
                  
                  let bgColor = 'bg-zinc-900/50';
                  let borderColor = 'border-white/5';
                  let textColor = 'text-zinc-400';
                  let icon = null;

                  if (isToday) {
                    bgColor = 'bg-white';
                    borderColor = 'border-white';
                    textColor = 'text-black';
                  } else if (isPast) {
                    bgColor = 'bg-zinc-900/20';
                    borderColor = 'border-white/5';
                    textColor = 'text-zinc-700';
                  } else if (event === EventType.MONEY_MONDAY) {
                    bgColor = 'bg-emerald-500/10';
                    borderColor = 'border-emerald-500/20';
                    textColor = 'text-emerald-400';
                    icon = <Gift size={10} />;
                  } else if (event === EventType.MARKETPLACE_CELEBRATION) {
                    bgColor = 'bg-indigo-500/10';
                    borderColor = 'border-indigo-500/20';
                    textColor = 'text-indigo-400';
                    icon = <Tag size={10} />;
                  } else if (event === EventType.GATCHA_WEEKEND) {
                    bgColor = 'bg-amber-500/10';
                    borderColor = 'border-amber-500/20';
                    textColor = 'text-amber-400';
                    icon = <Zap size={10} />;
                  } else if (rotationGroup) {
                    bgColor = 'bg-rose-500/10';
                    borderColor = 'border-rose-500/20';
                    textColor = 'text-rose-400';
                    icon = <RefreshCw size={10} />;
                  }

                  return (
                    <motion.div
                      key={day}
                      whileHover={!isPast ? { scale: 1.05, y: -2 } : {}}
                      className={`aspect-square rounded-xl border ${borderColor} ${bgColor} p-2 flex flex-col items-center justify-center relative group transition-colors`}
                    >
                      <span className={`text-sm font-bold ${textColor}`}>{day}</span>
                      {icon && !isToday && !isPast && (
                        <div className="mt-1">{icon}</div>
                      )}
                      {rotationGroup && !isToday && !isPast && (
                        <div className="absolute -bottom-1 -left-1 bg-rose-500 text-white text-[8px] font-bold px-1 rounded-sm shadow-lg">
                          G-{rotationGroup}
                        </div>
                      )}
                      {isToday && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-indigo-500 rounded-full border-2 border-zinc-900" />
                      )}
                      {isPast && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-20">
                          <div className="w-full h-px bg-zinc-500 rotate-45" />
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Info Box */}
      <div className="bg-zinc-900/50 border border-white/5 rounded-[32px] p-8 flex flex-col md:flex-row items-center gap-8">
        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center text-zinc-400 shrink-0">
          <Info size={32} />
        </div>
        <div className="space-y-2 text-center md:text-left">
          <h4 className="text-xl font-display font-bold text-white text-balance">Event Reset Information</h4>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Events rotate daily at <span className="text-white font-bold">12:00 AM EST</span>. 
            Make sure to claim your bonuses and take advantage of the marketplace celebrations before the day ends!
          </p>
        </div>
      </div>
    </div>
  );
};
