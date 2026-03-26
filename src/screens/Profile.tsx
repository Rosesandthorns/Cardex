import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '../components/Card';
import { UserProfile, UserCard, Activity } from '../types';
import { Calendar, Award, Coins, Layers, Share2, Settings, LogOut, Zap, ShoppingBag, ArrowLeftRight, CheckCircle, Edit2, Check, X, AlertCircle, Cpu } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';

interface ProfileProps {
  user: UserProfile;
  collection: UserCard[];
  activities: Activity[];
  onLogout: () => void;
  setActiveTab: (tab: string) => void;
}

export const Profile: React.FC<ProfileProps> = ({ user, collection: userCollection, activities, onLogout, setActiveTab }) => {
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [isEditingDisplayName, setIsEditingDisplayName] = useState(false);
  const [newUsername, setNewUsername] = useState(user.username || '');
  const [newDisplayName, setNewDisplayName] = useState(user.displayName || '');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    setNewUsername(user.username || '');
    setNewDisplayName(user.displayName || '');
  }, [user.username, user.displayName]);

  const handleSaveUsername = async () => {
    if (!newUsername.trim() || newUsername === user.username) {
      setIsEditingUsername(false);
      return;
    }

    // Validate username format (alphanumeric, 3-20 chars)
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(newUsername)) {
      setError('Username must be 3-20 characters and only contain letters, numbers, or underscores.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Check for uniqueness
      const q = query(collection(db, 'users'), where('username', '==', newUsername.toLowerCase()));
      const snap = await getDocs(q);

      if (!snap.empty) {
        setError('This username is already taken. Please choose another.');
        setIsSaving(false);
        return;
      }

      // Update profile
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        username: newUsername.toLowerCase()
      });

      setIsEditingUsername(false);
    } catch (err) {
      console.error('Error updating username:', err);
      setError('Failed to update username. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDisplayName = async () => {
    if (!newDisplayName.trim() || newDisplayName === user.displayName) {
      setIsEditingDisplayName(false);
      return;
    }

    if (newDisplayName.length < 2 || newDisplayName.length > 30) {
      setError('Display name must be between 2 and 30 characters.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        displayName: newDisplayName.trim()
      });
      setIsEditingDisplayName(false);
    } catch (err) {
      console.error('Error updating display name:', err);
      setError('Failed to update display name.');
    } finally {
      setIsSaving(false);
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'pack': return ShoppingBag;
      case 'trade': return ArrowLeftRight;
      case 'quest': return Award;
      case 'market': return Coins;
      default: return Zap;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'pack': return 'text-indigo-400';
      case 'trade': return 'text-blue-400';
      case 'quest': return 'text-emerald-400';
      case 'market': return 'text-amber-400';
      default: return 'text-zinc-400';
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (mins > 0) return `${mins}m ago`;
    return 'Just now';
  };

  const uniqueCards = new Set(userCollection.map(c => c.cardId)).size;

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row gap-8 items-center md:items-end">
        <div className="w-32 h-32 rounded-[40px] overflow-hidden border-4 border-zinc-900 shadow-2xl relative">
          <img 
            src={user.photoURL || `https://picsum.photos/seed/${user.uid}/200/200`}
            alt={user.displayName}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 border border-white/10 rounded-[36px]" />
          <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl bg-emerald-500 flex items-center justify-center text-black shadow-lg border border-white/20 z-10">
            <Award size={20} />
          </div>
        </div>
        
        <div className="flex-grow text-center md:text-left space-y-4">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="space-y-1">
              <div className="flex items-center justify-center md:justify-start gap-3 group/name">
                {isEditingDisplayName ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      className="text-4xl font-display font-bold bg-zinc-900 border border-emerald-500/30 rounded-xl px-4 py-1 text-white focus:outline-none focus:border-emerald-500 transition-colors w-full max-w-md"
                      placeholder="Display Name"
                      autoFocus
                    />
                    <button 
                      onClick={handleSaveDisplayName}
                      disabled={isSaving}
                      className="p-2 bg-emerald-500 text-black rounded-xl hover:bg-emerald-400 transition-colors disabled:opacity-50"
                    >
                      {isSaving ? <Zap size={20} className="animate-spin" /> : <Check size={20} />}
                    </button>
                    <button 
                      onClick={() => { setIsEditingDisplayName(false); setNewDisplayName(user.displayName); setError(null); }}
                      className="p-2 bg-zinc-800 text-zinc-400 rounded-xl hover:text-white transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>
                ) : (
                  <>
                    <h2 className="text-5xl font-display font-bold text-white tracking-tight">{user.displayName}</h2>
                    <button 
                      onClick={() => setIsEditingDisplayName(true)}
                      className="p-2 text-zinc-600 hover:text-emerald-400 transition-colors opacity-0 group-hover/name:opacity-100"
                    >
                      <Edit2 size={18} />
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center justify-center md:justify-start gap-2 group/user">
                {isEditingUsername ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 font-mono">@</span>
                      <input
                        type="text"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value.toLowerCase())}
                        className="bg-zinc-900 border border-emerald-500/30 rounded-lg px-3 py-1 text-emerald-400 font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                        placeholder="new_username"
                        autoFocus
                      />
                      <button 
                        onClick={handleSaveUsername}
                        disabled={isSaving}
                        className="p-1.5 bg-emerald-500 text-black rounded-lg hover:bg-emerald-400 transition-colors disabled:opacity-50"
                      >
                        {isSaving ? <Zap size={16} className="animate-spin" /> : <Check size={16} />}
                      </button>
                      <button 
                        onClick={() => { setIsEditingUsername(false); setNewUsername(user.username); setError(null); }}
                        className="p-1.5 bg-zinc-800 text-zinc-400 rounded-lg hover:text-white transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    {error && (
                      <div className="flex items-center gap-1.5 text-xs text-rose-400 font-medium animate-in fade-in slide-in-from-top-1">
                        <AlertCircle size={12} />
                        <span>{error}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <span className="text-xl font-mono text-emerald-400/60">@{user.username || 'collector'}</span>
                    <button 
                      onClick={() => setIsEditingUsername(true)}
                      className="p-1 text-zinc-600 hover:text-emerald-400 transition-colors opacity-0 group-hover/user:opacity-100"
                    >
                      <Edit2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-center md:ml-auto">
              <button className="p-2 bg-zinc-900 border border-white/5 rounded-xl text-zinc-400 hover:text-white transition-colors">
                <Share2 size={18} />
              </button>
              <button className="p-2 bg-zinc-900 border border-white/5 rounded-xl text-zinc-400 hover:text-white transition-colors">
                <Settings size={18} />
              </button>
              <button 
                onClick={onLogout}
                className="p-2 bg-zinc-900 border border-red-500/20 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors"
                title="Logout"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
          
          <div className="flex flex-wrap justify-center md:justify-start gap-6 text-zinc-500 text-sm font-medium">
            <div className="flex items-center gap-2">
              <Calendar size={16} />
              <span>Joined {user.joinDate}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {[
          { label: 'Cards Owned', value: userCollection.length, icon: Layers },
          { label: 'Unique Collected', value: uniqueCards, icon: Award },
          { label: 'Current Chips', value: user.chips.toLocaleString(), icon: Coins },
          { label: 'Experience', value: user.xp.toLocaleString(), icon: Zap },
        ].map((stat, i) => (
          <div key={i} className="bg-zinc-900 rounded-3xl p-6 border border-white/5 space-y-1">
            <div className="flex items-center justify-between text-zinc-500 mb-2">
              <stat.icon size={16} className={i === 3 ? 'text-emerald-400' : ''} />
            </div>
            <p className="text-2xl font-display font-bold text-white">{stat.value}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Showcase */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-display font-bold text-white">Showcase</h3>
            <button className="text-emerald-400 text-sm font-bold hover:underline">Edit Showcase</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 bg-zinc-900/30 rounded-[40px] p-8 border border-white/5">
            {userCollection.slice(0, 6).map((userCard) => (
              <div key={userCard.id} className="flex justify-center">
                <Card card={userCard} size="md" />
              </div>
            ))}
            {userCollection.length < 6 && Array.from({ length: 6 - userCollection.length }).map((_, i) => (
              <div key={i} className="w-40 h-60 rounded-xl border-2 border-dashed border-white/5 flex items-center justify-center text-zinc-800">
                <Layers size={32} />
              </div>
            ))}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="space-y-6">
          <h3 className="text-xl font-display font-bold text-white">Recent Activity</h3>
          <div className="bg-zinc-900 rounded-[40px] p-8 border border-white/5 space-y-8">
            {activities.length > 0 ? (
              activities.slice(0, 5).map(activity => {
                const Icon = getActivityIcon(activity.type);
                const color = getActivityColor(activity.type);
                return (
                  <div key={activity.id} className="flex gap-4">
                    <div className={`w-10 h-10 rounded-2xl bg-zinc-800 flex items-center justify-center shrink-0 ${color}`}>
                      <Icon size={20} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-zinc-200 font-medium leading-tight">{activity.text}</p>
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{formatTime(activity.timestamp)}</p>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-zinc-500 text-sm text-center py-4">No recent activity</p>
            )}
            {activities.length > 5 && (
              <button className="w-full py-3 text-zinc-500 text-sm font-bold hover:text-zinc-300 transition-colors border-t border-white/5 pt-6">
                View Full History
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
