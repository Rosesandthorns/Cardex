import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '../components/Card';
import { UserCard, TradeOffer, UserProfile } from '../types';
import { ArrowLeftRight, Check, X, UserPlus, Search, Loader2, Sparkles } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, getDocs, getDoc, limit, deleteDoc } from 'firebase/firestore';
import { INITIAL_CARDS } from '../constants';
import Fuse from 'fuse.js';

interface TradesProps {
  user: UserProfile;
  collection: UserCard[];
  onProgressQuest: (type: string, amount?: number, metadata?: any) => void;
}

export const Trades: React.FC<TradesProps> = ({ user, collection: myCards, onProgressQuest }) => {
  const [activeTab, setActiveTab] = useState<'incoming' | 'outgoing' | 'history'>('incoming');
  const [isCreating, setIsCreating] = useState(false);
  const [incomingOffers, setIncomingOffers] = useState<TradeOffer[]>([]);
  const [outgoingOffers, setOutgoingOffers] = useState<TradeOffer[]>([]);
  const [historyOffers, setHistoryOffers] = useState<TradeOffer[]>([]);
  const [loading, setLoading] = useState(true);

  // Search state
  const [userSearch, setUserSearch] = useState('');
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedUserCards, setSelectedUserCards] = useState<UserCard[]>([]);
  const [myTradeCards, setMyTradeCards] = useState<string[]>([]);
  const [theirTradeCards, setTheirTradeCards] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [resolvedCards, setResolvedCards] = useState<Record<string, UserCard>>({});

  // Sorting logic helper (same as Collection.tsx)
  const sortCards = (cards: UserCard[]) => {
    return [...cards].sort((a, b) => {
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
  };

  const sortedMyCards = useMemo(() => sortCards(myCards), [myCards]);
  const sortedTheirCards = useMemo(() => sortCards(selectedUserCards), [selectedUserCards]);

  // Fetch all users for fuzzy search (limited to 50 for performance)
  useEffect(() => {
    if (isCreating) {
      const fetchUsers = async () => {
        setIsSearching(true);
        try {
          const q = query(collection(db, 'users'), limit(100));
          const snap = await getDocs(q);
          const users = snap.docs
            .map(d => d.data() as UserProfile)
            .filter(u => u.uid !== user.uid);
          setAllUsers(users);
        } catch (error) {
          console.error("Error fetching users for search:", error);
        } finally {
          setIsSearching(false);
        }
      };
      fetchUsers();
    }
  }, [isCreating, user.uid]);

  // Fuzzy search logic
  const filteredUsers = useMemo(() => {
    let result = allUsers;

    if (!userSearch) return result.slice(0, 10);

    const fuse = new Fuse(result, {
      keys: ['displayName', 'username'],
      threshold: 0.4,
    });

    return fuse.search(userSearch).map(r => r.item);
  }, [allUsers, userSearch]);

  useEffect(() => {
    const incomingQuery = query(collection(db, 'trades'), where('receiverUid', '==', user.uid));
    const unsubIncoming = onSnapshot(incomingQuery, async (snapshot) => {
      const validOffers: TradeOffer[] = [];
      const invalidDocIds: string[] = [];

      await Promise.all(snapshot.docs.map(async (d) => {
        const data = d.data();
        
        // Basic validation
        if (!data.senderUid || !data.receiverUid || !Array.isArray(data.senderCardIds)) {
          invalidDocIds.push(d.id);
          return;
        }

        try {
          // Fetch sender profile
          const senderSnap = await getDoc(doc(db, 'users', data.senderUid));
          if (!senderSnap.exists()) {
            invalidDocIds.push(d.id);
            return;
          }
          const senderData = senderSnap.data() as UserProfile;
          
          validOffers.push({ 
            id: d.id, 
            ...data,
            senderProfile: senderData
          } as any);
        } catch (err) {
          console.error(`Error processing trade ${d.id}:`, err);
          invalidDocIds.push(d.id);
        }
      }));

      // Cleanup invalid data from Firestore
      if (invalidDocIds.length > 0) {
        console.warn(`Cleaning up ${invalidDocIds.length} invalid incoming trades.`);
        invalidDocIds.forEach(id => {
          deleteDoc(doc(db, 'trades', id)).catch(err => 
            console.error(`Failed to delete invalid trade ${id}:`, err)
          );
        });
      }

      setIncomingOffers(validOffers.filter(o => o.status === 'pending'));
      setHistoryOffers(prev => {
        const incomingHistory = validOffers.filter(o => o.status !== 'pending');
        const otherHistory = prev.filter(o => o.receiverUid !== user.uid);
        return [...incomingHistory, ...otherHistory].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      });
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'trades'));

    const outgoingQuery = query(collection(db, 'trades'), where('senderUid', '==', user.uid));
    const unsubOutgoing = onSnapshot(outgoingQuery, async (snapshot) => {
      const validOffers: TradeOffer[] = [];
      const invalidDocIds: string[] = [];

      await Promise.all(snapshot.docs.map(async (d) => {
        const data = d.data();

        // Basic validation
        if (!data.senderUid || !data.receiverUid || !Array.isArray(data.senderCardIds)) {
          invalidDocIds.push(d.id);
          return;
        }

        try {
          const receiverSnap = await getDoc(doc(db, 'users', data.receiverUid));
          if (!receiverSnap.exists()) {
            invalidDocIds.push(d.id);
            return;
          }
          const receiverData = receiverSnap.data() as UserProfile;
          validOffers.push({ 
            id: d.id, 
            ...data,
            receiverProfile: receiverData
          } as any);
        } catch (err) {
          console.error(`Error processing trade ${d.id}:`, err);
          invalidDocIds.push(d.id);
        }
      }));

      // Cleanup invalid data from Firestore
      if (invalidDocIds.length > 0) {
        console.warn(`Cleaning up ${invalidDocIds.length} invalid outgoing trades.`);
        invalidDocIds.forEach(id => {
          deleteDoc(doc(db, 'trades', id)).catch(err => 
            console.error(`Failed to delete invalid trade ${id}:`, err)
          );
        });
      }

      setOutgoingOffers(validOffers.filter(o => o.status === 'pending'));
      setHistoryOffers(prev => {
        const outgoingHistory = validOffers.filter(o => o.status !== 'pending');
        const otherHistory = prev.filter(o => o.senderUid !== user.uid);
        return [...outgoingHistory, ...otherHistory].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      });
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'trades'));

    return () => {
      unsubIncoming();
      unsubOutgoing();
    };
  }, [user.uid]);

  // Effect to resolve all card IDs mentioned in visible trades
  useEffect(() => {
    const allOffers = [...incomingOffers, ...outgoingOffers, ...historyOffers];
    const allRequiredIds = new Set<string>();
    
    allOffers.forEach(offer => {
      offer.senderCardIds.forEach(id => allRequiredIds.add(id));
      offer.receiverCardIds.forEach(id => allRequiredIds.add(id));
    });

    // Remove IDs we already have in myCards or already resolved
    const missingIds = Array.from(allRequiredIds).filter(id => {
      return !myCards.some(mc => mc.id === id) && !resolvedCards[id];
    });

    if (missingIds.length === 0) return;

    const resolveCards = async () => {
      const newResolved: Record<string, UserCard> = { ...resolvedCards };
      
      // Fetch cards in chunks of 10 to be nice to Firestore
      for (let i = 0; i < missingIds.length; i += 10) {
        const chunk = missingIds.slice(i, i + 10);
        await Promise.all(chunk.map(async (id) => {
          try {
            const cardSnap = await getDoc(doc(db, 'user_cards', id));
            if (cardSnap.exists()) {
              const data = cardSnap.data();
              const cardDef = INITIAL_CARDS.find(c => c.id === data.cardId);
              if (cardDef) {
                newResolved[id] = { id: cardSnap.id, ...data, card: cardDef } as UserCard;
              }
            }
          } catch (err) {
            console.error(`Error resolving card ${id}:`, err);
          }
        }));
      }
      
      setResolvedCards(newResolved);
    };

    resolveCards();
  }, [incomingOffers, outgoingOffers, historyOffers, myCards]);

  const handleSelectUser = async (u: UserProfile) => {
    setSelectedUser(u);
    const q = query(collection(db, 'user_cards'), where('ownerUid', '==', u.uid));
    const snap = await getDocs(q);
    const invalidDocIds: string[] = [];
    const cards = snap.docs.map(d => {
      const data = d.data();
      const cardDef = INITIAL_CARDS.find(c => c.id === data.cardId);
      
      if (!cardDef || !data.ownerUid || typeof data.printNumber !== 'number') {
        invalidDocIds.push(d.id);
        return null;
      }

      return { id: d.id, ...data, card: cardDef } as UserCard;
    }).filter((c): c is UserCard => c !== null);

    // Cleanup invalid data from Firestore
    if (invalidDocIds.length > 0) {
      console.warn(`Cleaning up ${invalidDocIds.length} invalid user cards for user ${u.uid}.`);
      invalidDocIds.forEach(id => {
        deleteDoc(doc(db, 'user_cards', id)).catch(err => 
          console.error(`Failed to delete invalid user card ${id}:`, err)
        );
      });
    }

    setSelectedUserCards(cards);
  };

  const handleSendOffer = async () => {
    if (!selectedUser || myTradeCards.length === 0 || isSending) return;
    setIsSending(true);
    try {
      const isGift = theirTradeCards.length === 0;
      const status = isGift ? 'accepted' : 'pending';

      const tradeDoc = {
        senderUid: user.uid,
        receiverUid: selectedUser.uid,
        senderCardIds: myTradeCards,
        receiverCardIds: theirTradeCards,
        status,
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'trades'), tradeDoc);

      if (isGift) {
        // Transfer cards immediately
        for (const cardId of myTradeCards) {
          await updateDoc(doc(db, 'user_cards', cardId), { ownerUid: selectedUser.uid });
        }

        await addDoc(collection(db, 'activities'), {
          uid: user.uid,
          text: `Sent a gift to ${selectedUser.displayName}!`,
          type: 'trade',
          timestamp: new Date().toISOString()
        });

        // Progress quest
        onProgressQuest('gift', 1);
      } else {
        await addDoc(collection(db, 'activities'), {
          uid: user.uid,
          text: `Sent a trade offer to ${selectedUser.displayName}`,
          type: 'trade',
          timestamp: new Date().toISOString()
        });
      }

      setIsCreating(false);
      setSelectedUser(null);
      setMyTradeCards([]);
      setTheirTradeCards([]);
    } catch (error) {
      console.error("Error sending trade offer:", error);
    } finally {
      setIsSending(false);
    }
  };

  const handleUpdateStatus = async (offerId: string, status: 'accepted' | 'declined' | 'cancelled') => {
    try {
      const tradeRef = doc(db, 'trades', offerId);
      await updateDoc(tradeRef, { 
        status,
        updatedAt: new Date().toISOString()
      });

      if (status === 'accepted') {
        const offer = incomingOffers.find(o => o.id === offerId);
        if (offer) {
          // In a real app, this MUST be a transaction on the server
          // Transfer sender cards to receiver
          for (const cardId of offer.senderCardIds) {
            await updateDoc(doc(db, 'user_cards', cardId), { ownerUid: user.uid });
          }
          // Transfer receiver cards to sender
          for (const cardId of offer.receiverCardIds) {
            await updateDoc(doc(db, 'user_cards', cardId), { ownerUid: offer.senderUid });
          }

          await addDoc(collection(db, 'activities'), {
            uid: user.uid,
            text: `Accepted trade from ${offer.senderProfile?.displayName || 'another user'}`,
            type: 'trade',
            timestamp: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      console.error("Error updating trade status:", error);
    }
  };

  const getCardById = (id: string) => {
    // 1. Check current resolution cache (priority for trade display)
    if (resolvedCards[id]) return resolvedCards[id];
    
    // 2. Check my cards
    const myCard = myCards.find(c => c.id === id);
    if (myCard) return myCard;
    
    // 3. Check selected user cards (if in creation mode)
    const theirCard = selectedUserCards.find(c => c.id === id);
    if (theirCard) return theirCard;
    
    return null;
  };

  const currentOffers = activeTab === 'incoming' 
    ? incomingOffers 
    : activeTab === 'outgoing' 
      ? outgoingOffers 
      : historyOffers;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-white mb-2">Trades</h1>
          <p className="text-zinc-400">Exchange cards with other collectors.</p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl transition-colors shadow-lg shadow-emerald-500/20"
        >
          <UserPlus size={20} />
          New Trade Offer
        </button>
      </div>

      <div className="flex gap-2 p-1 bg-zinc-900/50 rounded-xl w-fit border border-white/5">
        <button
          onClick={() => setActiveTab('incoming')}
          className={`px-6 py-2 rounded-lg font-medium transition-all ${
            activeTab === 'incoming' 
              ? 'bg-zinc-800 text-white shadow-lg' 
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Incoming ({incomingOffers.length})
        </button>
        <button
          onClick={() => setActiveTab('outgoing')}
          className={`px-6 py-2 rounded-lg font-medium transition-all ${
            activeTab === 'outgoing' 
              ? 'bg-zinc-800 text-white shadow-lg' 
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Outgoing ({outgoingOffers.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-6 py-2 rounded-lg font-medium transition-all ${
            activeTab === 'history' 
              ? 'bg-zinc-800 text-white shadow-lg' 
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          History ({historyOffers.length})
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
            <Loader2 className="animate-spin mb-4" size={40} />
            <p>Loading trades...</p>
          </div>
        ) : currentOffers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-zinc-900/30 rounded-3xl border border-dashed border-white/10 text-zinc-500">
            <ArrowLeftRight size={48} className="mb-4 opacity-20" />
            <p>No {activeTab} trade offers at the moment.</p>
          </div>
        ) : (
          currentOffers.map((offer) => {
            const isIncoming = offer.receiverUid === user.uid;
            const otherProfile = isIncoming ? offer.senderProfile : offer.receiverProfile;
            
            return (
              <motion.div
                key={offer.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-zinc-900/50 rounded-3xl border border-white/5 overflow-hidden"
              >
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl">
                      {otherProfile?.displayName?.[0] || '?'}
                    </div>
                    <div>
                      <p className="text-sm text-zinc-400">{isIncoming ? 'Offer from' : 'Offer to'}</p>
                      <p className="font-bold text-white">
                        {otherProfile?.displayName || 'Unknown Collector'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      offer.status === 'pending' ? 'bg-amber-500/20 text-amber-500' :
                      offer.status === 'accepted' ? 'bg-emerald-500/20 text-emerald-500' :
                      offer.status === 'cancelled' ? 'bg-zinc-500/20 text-zinc-500' :
                      'bg-rose-500/20 text-rose-500'
                    }`}>
                      {offer.status}
                    </span>
                    {isIncoming && offer.status === 'pending' && (
                      <div className="flex gap-2 ml-4">
                        <button 
                          onClick={() => handleUpdateStatus(offer.id, 'accepted')}
                          className="p-2 bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg transition-colors"
                        >
                          <Check size={20} />
                        </button>
                        <button 
                          onClick={() => handleUpdateStatus(offer.id, 'declined')}
                          className="p-2 bg-rose-500 hover:bg-rose-400 text-white rounded-lg transition-colors"
                        >
                          <X size={20} />
                        </button>
                      </div>
                    )}
                    {!isIncoming && offer.status === 'pending' && (
                      <div className="flex gap-2 ml-4">
                        <button 
                          onClick={() => handleUpdateStatus(offer.id, 'cancelled')}
                          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-colors text-xs font-bold flex items-center gap-1.5"
                        >
                          <X size={14} />
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              
              <div className="p-8 grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] items-center gap-8">
                <div className="space-y-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 text-center">Offering</p>
                  <div className="flex flex-wrap justify-center gap-4">
                    {offer.senderCardIds.map(id => {
                      const card = getCardById(id);
                      return card ? (
                        <div key={id} className="w-32">
                          <Card card={card} size="sm" />
                        </div>
                      ) : <div key={id} className="w-32 h-48 bg-zinc-800 rounded-xl animate-pulse" />;
                    })}
                  </div>
                </div>

                <div className="flex justify-center">
                  <div className="w-12 h-12 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-zinc-400">
                    <ArrowLeftRight size={24} />
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 text-center">Requesting</p>
                  <div className="flex flex-wrap justify-center gap-4">
                    {offer.receiverCardIds.map(id => {
                      const card = getCardById(id);
                      return card ? (
                        <div key={id} className="w-32">
                          <Card card={card} size="sm" />
                        </div>
                      ) : <div key={id} className="w-32 h-48 bg-zinc-800 rounded-xl animate-pulse" />;
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })
      )}
    </div>

      <AnimatePresence>
        {isCreating && (
          <div className="fixed inset-0 z-[110] overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreating(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-md"
            />
            <div className="min-h-full flex items-center justify-center p-4 md:p-6">
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="relative bg-zinc-900 border border-white/10 rounded-[2rem] md:rounded-[2.5rem] w-full max-w-5xl flex flex-col my-8"
              >
                <div className="p-6 md:p-8 border-b border-white/5 flex items-center justify-between">
                  <h2 className="text-xl md:text-2xl font-bold text-white">Create Trade Offer</h2>
                  <button 
                    onClick={() => setIsCreating(false)}
                    className="p-2 hover:bg-white/5 rounded-full text-zinc-400 transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>

                <div className="p-6 md:p-8 space-y-8">
                {!selectedUser ? (
                  <div className="space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <p className="text-zinc-400">Find a user to trade with:</p>
                    </div>
                    
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={20} />
                      <input
                        type="text"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Search by name or @username..."
                        className="w-full bg-zinc-800 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {isSearching ? (
                        <div className="col-span-full py-10 flex flex-col items-center text-zinc-500">
                          <Loader2 className="animate-spin mb-2" />
                          <p>Loading users...</p>
                        </div>
                      ) : filteredUsers.length > 0 ? (
                        filteredUsers.map(u => (
                          <button
                            key={u.uid}
                            onClick={() => handleSelectUser(u)}
                            className="flex items-center gap-4 p-4 bg-zinc-800/50 hover:bg-zinc-800 border border-white/5 rounded-2xl transition-all text-left group"
                          >
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-xl">
                              {u.displayName[0]}
                            </div>
                            <div className="flex-1">
                              <p className="font-bold text-white group-hover:text-emerald-400 transition-colors">{u.displayName}</p>
                              <div className="flex items-center gap-2">
                                <p className="text-xs text-zinc-500">@{u.username}</p>
                              </div>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="col-span-full py-10 text-center text-zinc-500">
                          <p>No users found matching your search.</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-12">
                    <div className="flex items-center justify-between p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-black font-bold">
                          {selectedUser.displayName[0]}
                        </div>
                        <p className="font-bold text-white">Trading with {selectedUser.displayName}</p>
                      </div>
                      <button 
                        onClick={() => setSelectedUser(null)}
                        className="text-emerald-500 text-sm font-bold hover:underline"
                      >
                        Change User
                      </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                      <div className="space-y-6">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                          Your Cards <span className="text-zinc-500 text-sm font-normal">({myTradeCards.length} selected)</span>
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                          {sortedMyCards.map(userCard => {
                            const isUnavailable = (userCard.isForSale || userCard.isPendingTrade) && !myTradeCards.includes(userCard.id);
                            return (
                              <button
                                key={userCard.id}
                                disabled={isUnavailable}
                                onClick={() => {
                                  if (myTradeCards.includes(userCard.id)) {
                                    setMyTradeCards(myTradeCards.filter(id => id !== userCard.id));
                                  } else {
                                    setMyTradeCards([...myTradeCards, userCard.id]);
                                  }
                                }}
                                className={`relative transition-all ${
                                  myTradeCards.includes(userCard.id) 
                                    ? 'ring-4 ring-emerald-500 rounded-2xl scale-95' 
                                    : isUnavailable
                                      ? 'opacity-40 grayscale cursor-not-allowed'
                                      : 'hover:scale-105'
                                }`}
                              >
                                <Card card={userCard} size="sm" />
                                {myTradeCards.includes(userCard.id) && (
                                  <div className="absolute top-2 right-2 bg-emerald-500 text-black rounded-full p-1 shadow-lg">
                                    <Check size={14} />
                                  </div>
                                )}
                                {isUnavailable && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl">
                                    <span className="text-[10px] font-bold text-white uppercase tracking-tighter bg-black/60 px-2 py-1 rounded">
                                      {userCard.isForSale ? 'For Sale' : 'In Trade'}
                                    </span>
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-6">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                          Their Cards <span className="text-zinc-500 text-sm font-normal">({theirTradeCards.length} selected)</span>
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                          {sortedTheirCards.map(userCard => (
                            <button
                              key={userCard.id}
                              onClick={() => {
                                if (theirTradeCards.includes(userCard.id)) {
                                  setTheirTradeCards(theirTradeCards.filter(id => id !== userCard.id));
                                } else {
                                  setTheirTradeCards([...theirTradeCards, userCard.id]);
                                }
                              }}
                              className={`relative transition-all ${
                                theirTradeCards.includes(userCard.id) 
                                  ? 'ring-4 ring-emerald-500 rounded-2xl scale-95' 
                                  : 'hover:scale-105'
                              }`}
                            >
                              <Card card={userCard} size="sm" />
                              {theirTradeCards.includes(userCard.id) && (
                                <div className="absolute top-2 right-2 bg-emerald-500 text-black rounded-full p-1 shadow-lg">
                                  <Check size={14} />
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-center pt-4">
                      <button
                        onClick={handleSendOffer}
                        disabled={myTradeCards.length === 0 || isSending}
                        className="flex items-center gap-3 px-12 py-4 bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 hover:bg-emerald-400 text-black font-bold rounded-2xl transition-all shadow-xl shadow-emerald-500/20"
                      >
                        {isSending ? (
                          <>
                            <Loader2 className="animate-spin" size={20} />
                            {theirTradeCards.length === 0 ? 'Sending Gift...' : 'Sending Offer...'}
                          </>
                        ) : (
                          <>
                            {theirTradeCards.length === 0 ? <Sparkles size={20} /> : <ArrowLeftRight size={20} />}
                            {theirTradeCards.length === 0 ? 'Send as Gift' : 'Send Trade Offer'}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      )}
      </AnimatePresence>
    </div>
  );
};
