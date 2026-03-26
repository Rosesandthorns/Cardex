/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Home } from './screens/Home';
import { Collection } from './screens/Collection';
import { Marketplace } from './screens/Marketplace';
import { Trades } from './screens/Trades';
import { CardBrowser } from './screens/CardBrowser';
import { Profile } from './screens/Profile';
import { PackOpening } from './screens/PackOpening';
import { Money } from './screens/Money';
import { Events } from './screens/Events';
import { FAQ } from './screens/FAQ';
import { INITIAL_CARDS, INITIAL_QUESTS, INITIAL_PACKS, QUEST_POOLS } from './constants';
import { Card, UserProfile, UserCard, Quest, Activity } from './types';
import { auth, db, loginWithGoogle, logout, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc, collection, query, where, updateDoc, addDoc, getDocs, deleteDoc, increment, runTransaction } from 'firebase/firestore';
import { LogIn, Sparkles } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userCards, setUserCards] = useState<UserCard[]>([]);
  const [userListings, setUserListings] = useState<string[]>([]);
  const [pendingSenderCardIds, setPendingSenderCardIds] = useState<string[]>([]);
  const [pendingReceiverCardIds, setPendingReceiverCardIds] = useState<string[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [openingPack, setOpeningPack] = useState<{ id: string; cost: number; count?: number } | null>(null);
  const [isAddingCards, setIsAddingCards] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastRarity, setLastRarity] = useState<string | null>(null);
  const [rarityStreak, setRarityStreak] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setUserProfile(null);
        setUserCards([]);
        setQuests([]);
        setActivities([]);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    let unsubProfile: () => void;
    let unsubCards: () => void;
    let unsubQuests: () => void;
    let unsubActivities: () => void;
    let unsubTradesSender: () => void;
    let unsubTradesReceiver: () => void;
    let unsubPendingTradesSender: () => void;
    let unsubPendingTradesReceiver: () => void;
    let unsubMyListings: () => void;
    let unsubSales: () => void;
    let unsubPurchases: () => void;

    const setupListeners = async () => {
      // Ensure user profile exists
      const userRef = doc(db, 'users', user.uid);
      try {
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          const baseUsername = (user.displayName || 'Collector').toLowerCase().replace(/\s+/g, '');
          const randomSuffix = Math.floor(1000 + Math.random() * 9000);
          const defaultUsername = `${baseUsername}${randomSuffix}`;

          const newProfile: UserProfile = {
            uid: user.uid,
            displayName: user.displayName || 'New Collector',
            username: defaultUsername,
            photoURL: user.photoURL || '',
            chips: 1000,
            xp: 0,
            level: 1,
            joinDate: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          };
          await setDoc(userRef, newProfile);
          setUserProfile(newProfile);

          // Initialize quests for new user
          await refreshQuests(user.uid, true);

          // Add initial activity
          await addDoc(collection(db, 'activities'), {
            uid: user.uid,
            text: 'Joined Vantage! Welcome to the collection.',
            type: 'quest',
            timestamp: new Date().toISOString()
          });
        } else {
          // Handle existing users without a username
          const data = userSnap.data() as UserProfile;
          if (!data.username) {
            const baseUsername = (data.displayName || 'Collector').toLowerCase().replace(/\s+/g, '');
            const randomSuffix = Math.floor(1000 + Math.random() * 9000);
            const defaultUsername = `${baseUsername}${randomSuffix}`;
            await updateDoc(userRef, { username: defaultUsername });
          }

          // Check for daily quest refresh or validation
          const today = new Date().toISOString().split('T')[0];
          if (data.lastQuestRefresh !== today) {
            await refreshQuests(user.uid, true);
          } else {
            // Even if it's the same day, validate quests to reroll invalid ones
            await refreshQuests(user.uid, false);
          }
        }
      } catch (error) {
        console.error("Error checking user profile:", error);
      }

      // Listen for user profile changes
      unsubProfile = onSnapshot(userRef, (doc) => {
        if (doc.exists()) {
          setUserProfile(doc.data() as UserProfile);
        }
      }, (error) => {
        if (auth.currentUser) {
          handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
        }
      });

      // Listen for user cards
      const cardsQuery = query(collection(db, 'user_cards'), where('ownerUid', '==', user.uid));
      unsubCards = onSnapshot(cardsQuery, async (snapshot) => {
        const invalidDocIds: string[] = [];
        const cards = snapshot.docs
          .map(doc => {
            const data = doc.data();
            if (data.isHidden) return null;
            const cardDef = INITIAL_CARDS.find(c => c.id === data.cardId);
            
            // If card definition is missing or data is corrupted, mark for deletion
            if (!cardDef || !data.ownerUid || typeof data.printNumber !== 'number') {
              invalidDocIds.push(doc.id);
              return null;
            }

            return {
              id: doc.id,
              ...data,
              card: cardDef
            } as UserCard;
          })
          .filter((uc): uc is UserCard => uc !== null);

        // Hide invalid data from Firestore
        if (invalidDocIds.length > 0) {
          console.warn(`Hiding ${invalidDocIds.length} invalid user cards for user ${user.uid}.`);
          invalidDocIds.forEach(id => {
            updateDoc(doc(db, 'user_cards', id), { isHidden: true }).catch(err => 
              console.error(`Failed to hide invalid user card ${id}:`, err)
            );
          });
        }

        setUserCards(cards);
      }, (error) => {
        if (auth.currentUser) {
          handleFirestoreError(error, OperationType.LIST, 'user_cards');
        }
      });

      // Listen for quests
      const questsQuery = query(collection(db, 'quests'), where('uid', '==', user.uid));
      unsubQuests = onSnapshot(questsQuery, (snapshot) => {
        const qList = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Quest));
        setQuests(qList);
      }, (error) => {
        if (auth.currentUser) {
          handleFirestoreError(error, OperationType.LIST, 'quests');
        }
      });

      // Listen for activities
      const activitiesQuery = query(collection(db, 'activities'), where('uid', '==', user.uid));
      unsubActivities = onSnapshot(activitiesQuery, (snapshot) => {
        const aList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Activity));
        setActivities(aList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      }, (error) => {
        if (auth.currentUser) {
          handleFirestoreError(error, OperationType.LIST, 'activities');
        }
      });

      // Listen for my active listings to mark cards as "For Sale"
      const myListingsQuery = query(collection(db, 'market_listings'), where('sellerUid', '==', user.uid), where('active', '==', true));
      unsubMyListings = onSnapshot(myListingsQuery, (snapshot) => {
        const listingCardIds = snapshot.docs.map(doc => doc.data().userCardId);
        setUserListings(listingCardIds);
      }, (error) => {
        if (auth.currentUser) {
          handleFirestoreError(error, OperationType.LIST, 'market_listings');
        }
      });

      // Listen for pending trades to mark cards as "Pending Trade"
      const pendingTradesSenderQuery = query(collection(db, 'trades'), where('senderUid', '==', user.uid), where('status', '==', 'pending'));
      unsubPendingTradesSender = onSnapshot(pendingTradesSenderQuery, (snapshot) => {
        const tradeCardIds = snapshot.docs.flatMap(doc => doc.data().senderCardIds || []);
        setPendingSenderCardIds(tradeCardIds);
      }, (error) => {
        if (auth.currentUser) {
          handleFirestoreError(error, OperationType.LIST, 'trades');
        }
      });

      const pendingTradesReceiverQuery = query(collection(db, 'trades'), where('receiverUid', '==', user.uid), where('status', '==', 'pending'));
      unsubPendingTradesReceiver = onSnapshot(pendingTradesReceiverQuery, (snapshot) => {
        const tradeCardIds = snapshot.docs.flatMap(doc => doc.data().receiverCardIds || []);
        setPendingReceiverCardIds(tradeCardIds);
      }, (error) => {
        if (auth.currentUser) {
          handleFirestoreError(error, OperationType.LIST, 'trades');
        }
      });

      // Listen for accepted trades (to progress quests for both parties)
      const processTrades = (snapshot: any) => {
        const processedTradesKey = `processed_trades_${user.uid}`;
        const processedTrades = JSON.parse(localStorage.getItem(processedTradesKey) || '[]');
        const newProcessedTrades = [...processedTrades];
        let changed = false;

        snapshot.docs.forEach((doc: any) => {
          const data = doc.data();
          if (!processedTrades.includes(doc.id)) {
            const isSender = data.senderUid === user.uid;
            const cardCount = isSender ? (data.senderCardIds?.length || 0) : (data.receiverCardIds?.length || 0);
            progressQuest('trade', cardCount, user.uid);
            newProcessedTrades.push(doc.id);
            changed = true;
          }
        });

        if (changed) {
          localStorage.setItem(processedTradesKey, JSON.stringify(newProcessedTrades));
        }
      };

      const tradesSenderQuery = query(
        collection(db, 'trades'),
        where('senderUid', '==', user.uid),
        where('status', '==', 'accepted')
      );
      unsubTradesSender = onSnapshot(tradesSenderQuery, processTrades, (error) => {
        if (auth.currentUser) {
          handleFirestoreError(error, OperationType.LIST, 'trades');
        }
      });

      const tradesReceiverQuery = query(
        collection(db, 'trades'),
        where('receiverUid', '==', user.uid),
        where('status', '==', 'accepted')
      );
      unsubTradesReceiver = onSnapshot(tradesReceiverQuery, processTrades, (error) => {
        if (auth.currentUser) {
          handleFirestoreError(error, OperationType.LIST, 'trades');
        }
      });

      // Listen for sales (to process payouts for the seller)
      const salesQuery = query(
        collection(db, 'sales'),
        where('sellerUid', '==', user.uid),
        where('processed', '==', false)
      );
      unsubSales = onSnapshot(salesQuery, async (snapshot) => {
        for (const sDoc of snapshot.docs) {
          const saleRef = doc(db, 'sales', sDoc.id);
          const userRef = doc(db, 'users', user.uid);
          try {
            // Use a transaction to atomically check + credit + mark processed.
            // This prevents double-crediting if the snapshot fires again before
            // "processed: true" is persisted (e.g. on reconnect or race condition).
            let credited = false;
            await runTransaction(db, async (transaction) => {
              const saleSnap = await transaction.get(saleRef);
              if (!saleSnap.exists() || saleSnap.data().processed === true) {
                return; // Already processed — skip
              }
              const sale = saleSnap.data();
              transaction.update(userRef, { chips: increment(sale.payout) });
              transaction.update(saleRef, { processed: true });
              credited = true;
            });

            if (credited) {
              const sale = sDoc.data();
              progressQuest('sell_market', 1, user.uid);
              await addDoc(collection(db, 'activities'), {
                uid: user.uid,
                text: `Sold ${sale.cardName} for ${sale.price} Chips (${sale.tax} tax)`,
                type: 'sale',
                timestamp: new Date().toISOString()
              });
            }
          } catch (error) {
            console.error("Error processing sale payout:", error);
          }
        }
      }, (error) => {
        if (auth.currentUser) {
          handleFirestoreError(error, OperationType.LIST, 'sales');
        }
      });

      // Listen for purchases (to progress buy_market and spend_chips quests for the buyer)
      const purchasesQuery = query(
        collection(db, 'sales'),
        where('buyerUid', '==', user.uid)
      );
      unsubPurchases = onSnapshot(purchasesQuery, async (snapshot) => {
        const processedPurchasesKey = `processed_purchases_${user.uid}`;
        const processedPurchases = JSON.parse(localStorage.getItem(processedPurchasesKey) || '[]');
        const newProcessedPurchases = [...processedPurchases];
        let changed = false;

        for (const pDoc of snapshot.docs) {
          const sale = pDoc.data();
          if (!processedPurchases.includes(pDoc.id)) {
            progressQuest('buy_market', 1, user.uid);
            progressQuest('spend_chips', sale.price, user.uid);
            newProcessedPurchases.push(pDoc.id);
            changed = true;
          }
        }

        if (changed) {
          localStorage.setItem(processedPurchasesKey, JSON.stringify(newProcessedPurchases));
        }
      }, (error) => {
        if (auth.currentUser) {
          handleFirestoreError(error, OperationType.LIST, 'sales');
        }
      });

      setLoading(false);
    };

    setupListeners();

    return () => {
      if (unsubProfile) unsubProfile();
      if (unsubCards) unsubCards();
      if (unsubQuests) unsubQuests();
      if (unsubActivities) unsubActivities();
      if (unsubTradesSender) unsubTradesSender();
      if (unsubTradesReceiver) unsubTradesReceiver();
      if (unsubPendingTradesSender) unsubPendingTradesSender();
      if (unsubPendingTradesReceiver) unsubPendingTradesReceiver();
      if (unsubMyListings) unsubMyListings();
      if (unsubSales) unsubSales();
      if (unsubPurchases) unsubPurchases();
    };
  }, [user]);

  useEffect(() => {
    if (user && userProfile) {
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(async (position) => {
          const { latitude, longitude } = position.coords;
          const userRef = doc(db, 'users', user.uid);
          
          // Only update if location has changed significantly or hasn't been updated in 1 hour
          const lastUpdated = userProfile.location?.lastUpdated;
          const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
          
          if (!lastUpdated || lastUpdated < oneHourAgo) {
            await updateDoc(userRef, {
              location: {
                lat: latitude,
                lng: longitude,
                lastUpdated: new Date().toISOString()
              }
            });
          }
        }, (error) => {
          console.warn("Geolocation error:", error.message);
        });
      }
    }
  }, [user, userProfile?.uid]);

  const handleOpenPack = (packId: string, cost: number, count: number = 1) => {
    if (userProfile && userProfile.chips >= cost) {
      setOpeningPack({ id: packId, cost, count });
    }
  };

  const progressQuest = async (type: string, amount: number = 1, uid?: string) => {
    const targetUid = uid || user?.uid;
    if (!targetUid) return;
    try {
      const q = query(collection(db, 'quests'), where('uid', '==', targetUid), where('type', '==', type));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        console.log(`No active quests found for type: ${type}`);
        return;
      }

      for (const questDoc of snap.docs) {
        await runTransaction(db, async (transaction) => {
          const qSnap = await transaction.get(doc(db, 'quests', questDoc.id));
          if (!qSnap.exists()) return;
          
          const data = qSnap.data() as Quest;
          if (data.completed) return;

          const newProgress = Math.min(data.progress + amount, data.total);
          console.log(`Progressing quest "${data.title}": ${data.progress} -> ${newProgress} / ${data.total}`);
          
          transaction.update(doc(db, 'quests', questDoc.id), {
            progress: newProgress,
            completed: newProgress >= data.total
          });
        });
      }
    } catch (error) {
      console.error("Error progressing quest:", error);
    }
  };

  const refreshQuests = async (uid: string, force: boolean = false) => {
    const today = new Date().toISOString().split('T')[0];
    const userRef = doc(db, 'users', uid);
    
    const q = query(collection(db, 'quests'), where('uid', '==', uid));
    const snap = await getDocs(q);
    const existingQuests = snap.docs.map(d => ({ id: d.id, ...d.data() } as Quest));

    // If it's a daily refresh, clear all non-completed quests or just clear everything
    if (force) {
      for (const q of existingQuests) {
        await deleteDoc(doc(db, 'quests', q.id));
      }
    } else {
      // Reroll invalid quests (not completed and not in current pools)
      const validIds = [...QUEST_POOLS.easy, ...QUEST_POOLS.medium, ...QUEST_POOLS.hard].map(t => t.questId);
      for (const q of existingQuests) {
        if (!q.completed && !validIds.includes(q.questId)) {
          await deleteDoc(doc(db, 'quests', q.id));
        }
      }
    }

    // Re-fetch or filter to see what we have now
    const currentSnap = await getDocs(q);
    const currentQuests = currentSnap.docs.map(d => ({ id: d.id, ...d.data() } as Quest));

    const difficulties: ('easy' | 'medium' | 'hard')[] = ['easy', 'medium', 'hard'];
    for (const diff of difficulties) {
      const hasQuest = currentQuests.some(q => q.difficulty === diff);
      if (!hasQuest) {
        const pool = QUEST_POOLS[diff];
        const template = pool[Math.floor(Math.random() * pool.length)];
        await addDoc(collection(db, 'quests'), {
          uid,
          questId: template.questId,
          title: template.title,
          progress: 0,
          total: template.total,
          reward: template.reward,
          difficulty: template.difficulty,
          type: template.type,
          completed: false,
          claimed: false
        });
      }
    }

    await updateDoc(userRef, { lastQuestRefresh: today });
  };

  const handleAddCards = async (newCards: Card[]) => {
    if (!user || !userProfile || isAddingCards || !openingPack) return;
    setIsAddingCards(true);

    try {
      // 1. Deduct chips based on the actual cost passed from the store
      const packCost = openingPack.cost;
      
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        chips: Math.max(0, userProfile.chips - packCost)
      });

      // 2. Add cards to Firestore
      let currentLastRarity = lastRarity;
      let currentStreak = rarityStreak;

      for (const card of newCards) {
        // Fetch current count to get next print number
        const q = query(collection(db, 'user_cards'), where('cardId', '==', card.id));
        const snap = await getDocs(q);
        const docsArray = snap.docs.map(d => d.data().printNumber as number).filter(n => typeof n === 'number').sort((a,b) => a - b);
        let assignedPrintNumber = 1;
        for (const num of docsArray) {
          if (num === assignedPrintNumber) {
            assignedPrintNumber++;
          } else if (num > assignedPrintNumber) {
            break;
          }
        }
        const printNumber = assignedPrintNumber;

        await addDoc(collection(db, 'user_cards'), {
          ownerUid: user.uid,
          cardId: card.id,
          printNumber,
          totalPrintRun: card.totalPrintRun,
          acquiredAt: new Date().toISOString()
        });

        // Log activity for each card
        await addDoc(collection(db, 'activities'), {
          uid: user.uid,
          text: `Pulled ${card.name} #${printNumber} from a pack!`,
          type: 'pack',
          timestamp: new Date().toISOString()
        });

        // Progress quests
        if (card.rarity === 'Rare' || card.rarity === 'Legendary') {
          await progressQuest('get_rare_legendary', 1);
        }

        if (currentLastRarity === card.rarity) {
          currentStreak++;
          if (currentStreak >= 2) {
            await progressQuest('same_rarity_streak', 1);
          }
        } else {
          currentStreak = 1;
          currentLastRarity = card.rarity;
        }
      }

      setLastRarity(currentLastRarity);
      setRarityStreak(currentStreak);

      // 3. Progress "Open a pack" quest
      await progressQuest('open_pack', 1);
      await progressQuest('spend_chips', packCost);

    } catch (error) {
      console.error("Error adding cards:", error);
    } finally {
      setIsAddingCards(false);
    }
  };

  const handleClosePack = () => {
    setOpeningPack(null);
    setActiveTab('collection');
  };

  if (loading || (user && !userProfile)) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Sparkles className="w-12 h-12 text-emerald-400 animate-pulse" />
          <p className="text-emerald-400/60 font-mono text-sm tracking-widest uppercase">Initializing Vantage...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-zinc-900/50 border border-white/5 rounded-3xl p-12 text-center backdrop-blur-xl">
          <div className="w-20 h-20 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-8">
            <Sparkles className="w-10 h-10 text-emerald-400" />
          </div>
          <h1 className="text-4xl font-display font-bold text-white mb-4 tracking-tight">VANTAGE</h1>
          <p className="text-zinc-400 mb-12 leading-relaxed">
            The ultimate digital card collecting experience. Collect, trade, and dominate the marketplace.
          </p>
          <button
            onClick={loginWithGoogle}
            className="w-full bg-white text-black font-bold py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-emerald-400 transition-all active:scale-[0.98]"
          >
            <LogIn className="w-5 h-5" />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  const enrichedUserCards = userCards.map(card => ({
    ...card,
    isForSale: userListings.includes(card.id),
    isPendingTrade: pendingSenderCardIds.includes(card.id) || pendingReceiverCardIds.includes(card.id)
  }));

  const renderScreen = () => {
    if (openingPack) {
      return (
        <PackOpening 
          packId={openingPack.id} 
          packCost={openingPack.cost}
          userChips={userProfile?.chips || 0}
          onAddCards={handleAddCards}
          onClose={handleClosePack}
          onCancel={() => setOpeningPack(null)} 
          count={openingPack.count}
        />
      );
    }

    switch (activeTab) {
      case 'home':
        return <Home user={userProfile!} quests={quests} onOpenPack={handleOpenPack} />;
      case 'collection':
        return <Collection collection={enrichedUserCards} onProgressQuest={progressQuest} />;
      case 'market':
        return <Marketplace user={userProfile!} collection={enrichedUserCards} onProgressQuest={progressQuest} />;
      case 'trades':
        return <Trades user={userProfile!} collection={enrichedUserCards} onProgressQuest={progressQuest} />;
      case 'money':
        return <Money user={userProfile!} />;
      case 'profile':
        return <Profile user={userProfile!} collection={enrichedUserCards} activities={activities} onLogout={logout} setActiveTab={setActiveTab} />;
      case 'events':
        return <Events />;
      case 'faq':
        return <FAQ />;
      case 'list':
        return <CardBrowser />;
      default:
        return <Home user={userProfile!} quests={quests} onOpenPack={handleOpenPack} />;
    }
  };

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab} 
      chips={userProfile?.chips || 0}
      userPhotoURL={userProfile?.photoURL}
    >
      {renderScreen()}
    </Layout>
  );
}
