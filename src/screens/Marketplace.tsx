import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '../components/Card';
import { ChipDisplay } from '../components/ChipDisplay';
import { INITIAL_CARDS } from '../constants';
import { UserCard, MarketListing, UserProfile } from '../types';
import { Search, SlidersHorizontal, Tag, History, X, Loader2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot, deleteDoc, doc, updateDoc, addDoc, getDoc, getDocs, increment } from 'firebase/firestore';
import { getMarketplaceTax, EventType, getCurrentEvent } from '../utils/events';

interface MarketplaceProps {
  user: UserProfile;
  collection: UserCard[];
  onProgressQuest: (type: string, amount?: number, metadata?: any) => void;
}

export const Marketplace: React.FC<MarketplaceProps> = ({ user, collection: myCards, onProgressQuest }) => {
  const [activeTab, setActiveTab] = useState<'browse' | 'my-listings'>('browse');
  const [search, setSearch] = useState('');
  const [selectedListing, setSelectedListing] = useState<MarketListing | null>(null);
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBuying, setIsBuying] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'market_listings'));
    const unsub = onSnapshot(q, async (snapshot) => {
      const validListings: MarketListing[] = [];
      const invalidDocIds: string[] = [];

      await Promise.all(snapshot.docs.map(async (d) => {
        const data = d.data();
        const cardDef = INITIAL_CARDS.find(c => c.id === data.cardId);
        
        // If card definition is missing or data is corrupted, mark for deletion
        if (!cardDef || !data.sellerUid || typeof data.price !== 'number') {
          invalidDocIds.push(d.id);
          return;
        }

        try {
          // Fetch seller name
          const sellerSnap = await getDoc(doc(db, 'users', data.sellerUid));
          const sellerName = sellerSnap.exists() ? sellerSnap.data().displayName : 'Unknown';
          
          validListings.push({ 
            id: d.id, 
            ...data, 
            card: { ...cardDef, printNumber: data.printNumber, totalPrintRun: data.totalPrintRun },
            sellerName
          } as any);
        } catch (err) {
          console.error(`Error processing listing ${d.id}:`, err);
          invalidDocIds.push(d.id);
        }
      }));

      // Cleanup invalid data from Firestore
      if (invalidDocIds.length > 0) {
        console.warn(`Cleaning up ${invalidDocIds.length} invalid marketplace listings.`);
        invalidDocIds.forEach(id => {
          deleteDoc(doc(db, 'market_listings', id)).catch(err => 
            console.error(`Failed to delete invalid listing ${id}:`, err)
          );
        });
      }

      setListings(validListings);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'market_listings'));

    return () => unsub();
  }, []);

  const handleBuy = async () => {
    if (!selectedListing || user.chips < selectedListing.price || isBuying) return;
    setIsBuying(true);
    try {
      const taxRate = getMarketplaceTax();
      const taxAmount = Math.floor(selectedListing.price * taxRate);
      const sellerPayout = selectedListing.price - taxAmount;

      // 1. Update buyer's chips
      await updateDoc(doc(db, 'users', user.uid), {
        chips: increment(-selectedListing.price)
      });

      // 2. Create Sale record for seller payout
      await addDoc(collection(db, 'sales'), {
        sellerUid: selectedListing.sellerUid,
        buyerUid: user.uid,
        cardName: selectedListing.card?.name || 'Unknown Card',
        price: selectedListing.price,
        payout: sellerPayout,
        tax: taxAmount,
        processed: false,
        timestamp: new Date().toISOString()
      });

      // 3. Transfer card ownership
      await updateDoc(doc(db, 'user_cards', selectedListing.userCardId), {
        ownerUid: user.uid
      });

      // 4. Delete listing
      await deleteDoc(doc(db, 'market_listings', selectedListing.id));

      // 5. Log activity for buyer
      await addDoc(collection(db, 'activities'), {
        uid: user.uid,
        text: `Bought ${selectedListing.card.name} #${selectedListing.printNumber} for ${selectedListing.price} Chips`,
        type: 'purchase',
        timestamp: new Date().toISOString()
      });

      setSelectedListing(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'market_listings');
    } finally {
      setIsBuying(false);
    }
  };

  const browseListings = listings.filter(l => l.sellerUid !== user.uid && (l.card?.name || '').toLowerCase().includes(search.toLowerCase()));
  const myListings = listings.filter(l => l.sellerUid === user.uid).map(l => {
    const userCard = myCards.find(c => c.id === l.userCardId);
    return { ...l, userCard };
  });

  const displayListings = activeTab === 'browse' ? browseListings : myListings;

  return (
    <div className="space-y-8">
      {/* Tabs */}
      <div className="flex border-b border-white/5">
        <button
          onClick={() => setActiveTab('browse')}
          className={`px-8 py-4 font-bold text-sm transition-all relative ${
            activeTab === 'browse' ? 'text-white' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Browse Listings ({browseListings.length})
          {activeTab === 'browse' && (
            <motion.div layoutId="marketTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('my-listings')}
          className={`px-8 py-4 font-bold text-sm transition-all relative ${
            activeTab === 'my-listings' ? 'text-white' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          My Listings ({myListings.length})
          {activeTab === 'my-listings' && (
            <motion.div layoutId="marketTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />
          )}
        </button>
      </div>

      {activeTab === 'browse' ? (
        <>
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-grow">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input
                type="text"
                placeholder="Search marketplace..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-navy-800 border border-white/5 rounded-2xl py-3 pl-12 pr-4 focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
            </div>
            <button className="px-6 py-3 bg-navy-800 border border-white/5 rounded-2xl flex items-center gap-2 text-slate-300 hover:bg-navy-700 transition-all">
              <SlidersHorizontal size={18} />
              <span className="font-bold text-sm">Filters</span>
            </button>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
              <Loader2 className="animate-spin mb-4" size={40} />
              <p>Loading marketplace...</p>
            </div>
          ) : browseListings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-zinc-900/30 rounded-3xl border border-dashed border-white/10 text-zinc-500">
              <Tag size={48} className="mb-4 opacity-20" />
              <p>No active listings found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {browseListings.map(listing => (
                <motion.div
                  key={listing.id}
                  whileHover={{ y: -4 }}
                  className="bg-navy-800 rounded-3xl border border-white/5 p-4 flex gap-6 group"
                >
                  <div className="shrink-0">
                    <Card card={listing.card} size="sm" />
                  </div>
                  <div className="flex-grow flex flex-col justify-between py-2">
                    <div>
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="font-display font-bold text-lg text-white group-hover:text-indigo-400 transition-colors">
                          {listing.card?.name || 'Unknown Card'}
                        </h3>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                          {new Date(listing.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mb-3">Seller: <span className="text-slate-300">{(listing as any).sellerName}</span></p>
                      <div className="flex items-center gap-2">
                         <span className="text-xs font-mono text-slate-400">#{listing.printNumber} / {listing.totalPrintRun}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between mt-4">
                      <ChipDisplay amount={listing.price} size="md" />
                      <button 
                        onClick={() => setSelectedListing(listing)}
                        className="px-6 py-2 bg-white text-navy-900 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all"
                      >
                        Buy
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-6">
          {myListings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-navy-800 flex items-center justify-center text-slate-600">
                <Tag size={40} />
              </div>
              <div>
                <h3 className="text-xl font-display font-bold text-white">No active listings</h3>
                <p className="text-slate-500 max-w-xs mx-auto">You haven't listed any cards for sale yet. Go to your collection to start selling.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {myListings.map(listing => (
                <motion.div
                  key={listing.id}
                  className="bg-navy-800 rounded-3xl border border-white/5 p-4 flex gap-6 group opacity-75"
                >
                  <div className="shrink-0">
                    <Card card={listing.userCard || listing.card} size="sm" />
                  </div>
                  <div className="flex-grow flex flex-col justify-between py-2">
                    <div>
                      <h3 className="font-display font-bold text-lg text-white">
                        {listing.card?.name || 'Unknown Card'}
                      </h3>
                      <p className="text-xs text-slate-500 mb-3">Your Listing</p>
                      <div className="flex items-center gap-2">
                         <span className="text-xs font-mono text-slate-400">#{listing.printNumber} / {listing.totalPrintRun}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between mt-4">
                      <ChipDisplay amount={listing.price} size="md" />
                      <button 
                        onClick={async () => {
                          await deleteDoc(doc(db, 'market_listings', listing.id));
                        }}
                        className="px-4 py-2 bg-rose-500/10 text-rose-500 rounded-xl font-bold text-xs hover:bg-rose-500/20 transition-all"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Buy Confirmation Modal */}
      <AnimatePresence>
        {selectedListing && (
          <div className="fixed inset-0 z-[110] overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedListing(null)}
              className="fixed inset-0 bg-navy-900/80 backdrop-blur-md"
            />
            <div className="min-h-full flex items-center justify-center p-4 md:p-6">
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="relative bg-navy-800 rounded-[32px] md:rounded-[40px] border border-white/10 p-6 md:p-8 max-w-md w-full text-center space-y-6 md:space-y-8 my-8"
              >
                <div className="flex justify-center">
                  <Card card={selectedListing.card as any} size="md" />
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-xl md:text-2xl font-display font-bold text-white">Confirm Purchase</h3>
                  <p className="text-sm md:text-base text-slate-400">
                    Are you sure you want to buy <span className="text-white font-bold">{selectedListing.card?.name || 'Unknown Card'} #{selectedListing.printNumber}</span> from <span className="text-white font-bold">{(selectedListing as any).sellerName}</span>?
                  </p>
                </div>

                <div className="bg-navy-900/50 rounded-2xl p-4 md:p-6 border border-white/5 flex flex-col items-center gap-2">
                  <p className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-slate-500">Total Cost</p>
                  <ChipDisplay amount={selectedListing.price} size="lg" />
                  <div className="flex flex-col items-center mt-2 pt-2 border-t border-white/5 w-full">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Marketplace Tax ({getMarketplaceTax() * 100}%)</p>
                    <p className="text-xs text-rose-500 font-mono">-{Math.floor(selectedListing.price * getMarketplaceTax())} Chips</p>
                    {getCurrentEvent() === EventType.MARKETPLACE_CELEBRATION && (
                      <p className="text-[10px] text-indigo-400 font-bold mt-1">✨ Marketplace Celebration: 50% Tax Cut!</p>
                    )}
                  </div>
                  {user.chips < selectedListing.price && (
                    <p className="text-rose-500 text-xs font-bold mt-2">Insufficient Chips!</p>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <button 
                    onClick={() => setSelectedListing(null)}
                    className="flex-grow py-3 md:py-4 bg-navy-700 text-white rounded-2xl font-bold hover:bg-navy-600 transition-all text-sm md:text-base"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleBuy}
                    disabled={user.chips < selectedListing.price || isBuying}
                    className="flex-grow py-3 md:py-4 bg-white disabled:bg-zinc-600 disabled:text-zinc-400 text-navy-900 rounded-2xl font-bold hover:bg-slate-200 transition-all shadow-xl flex items-center justify-center gap-2 text-sm md:text-base"
                  >
                    {isBuying ? (
                      <>
                        <Loader2 className="animate-spin" size={20} />
                        Processing...
                      </>
                    ) : (
                      'Confirm Buy'
                    )}
                  </button>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
