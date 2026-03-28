/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * IMPORTANT: See guidelines.md before modifying this file.
 * This is the REAL Firebase-connected App. Do NOT replace it with a fake
 * offline / demo version. Firebase errors must show the error screen, not
 * a fake working app with static data.
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
import { RarePairs } from './components/RarePairs';
import { INITIAL_CARDS, INITIAL_QUESTS, INITIAL_PACKS, QUEST_POOLS } from './constants';
import { Card, UserProfile, UserCard, Quest, Activity } from './types';
import { auth, db, loginWithGoogle, logout, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import {
  doc, onSnapshot, setDoc, getDoc, collection, query, where, updateDoc,
  addDoc, getDocs, deleteDoc, increment, runTransaction
} from 'firebase/firestore';
import { LogIn, Sparkles, AlertTriangle, RefreshCcw } from 'lucide-react';

// ── Error Screen ───────────────────────────────────────────────────────────
// See guidelines.md: Firebase errors MUST show this screen, never a fake app.
const FirebaseErrorScreen = ({ error }: { error: string }) => (
  <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6">
    <div className="max-w-lg w-full bg-rose-950/30 border border-rose-500/30 rounded-3xl p-12 text-center backdrop-blur-xl">
      <div className="w-20 h-20 bg-rose-500/10 rounded-2xl flex items-center justify-center mx-auto mb-8">
        <AlertTriangle className="w-10 h-10 text-rose-400" />
      </div>
      <h1 className="text-3xl font-display font-bold text-white mb-4">Connection Error</h1>
      <p className="text-zinc-400 mb-4 leading-relaxed">
        Vantage could not connect to its database. This is a real error — the app will not show
        fake data. Please check your network connection or Firebase configuration.
      </p>
      <div className="bg-black/40 rounded-xl p-4 mb-8 text-left font-mono text-xs text-rose-300 break-all max-h-40 overflow-auto">
        {error}
      </div>
      <p className="text-zinc-600 text-xs mb-6">
        Full error details have been printed to the browser console.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="w-full bg-rose-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-rose-500 transition-all active:scale-[0.98]"
      >
        <RefreshCcw className="w-5 h-5" />
        Retry
      </button>
    </div>
  </div>
);

// ── App ────────────────────────────────────────────────────────────────────
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
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const [lastRarity, setLastRarity] = useState<string | null>(null);
  const [rarityStreak, setRarityStreak] = useState(0);

  // Rare Pairs state (persisted in localStorage across sessions)
  const [rarePairsStreak, setRarePairsStreak] = useState<number>(() => {
    const saved = localStorage.getItem('rp_streak');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [showRarePairs, setShowRarePairs] = useState(false);

  // Persist streak
  useEffect(() => {
    localStorage.setItem('rp_streak', rarePairsStreak.toString());
  }, [rarePairsStreak]);

  // ── Auth Listener ────────────────────────────────────────────────────────
  useEffect(() => {
    console.log('[App] Setting up Firebase auth state listener...');
    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        if (firebaseUser) {
          console.log('[App/Auth] ✅ User signed in. UID:', firebaseUser.uid, '| Email:', firebaseUser.email);
        } else {
          console.log('[App/Auth] User signed out / no session.');
        }
        setUser(firebaseUser);
        if (!firebaseUser) {
          setUserProfile(null);
          setUserCards([]);
          setQuests([]);
          setActivities([]);
          setLoading(false);
        }
      },
      (error) => {
        console.error('[App/Auth] ❌ Auth state listener error:', error);
        setFirebaseError(`Auth error: ${error.message}`);
        setLoading(false);
      }
    );
    return () => {
      console.log('[App] Tearing down auth listener.');
      unsubscribe();
    };
  }, []);

  // ── Firestore Listeners ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    console.log('[App] Setting up Firestore listeners for user:', user.uid);

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
      const userRef = doc(db, 'users', user.uid);

      // ── Profile setup / load ─────────────────────────────────────────────
      try {
        console.log('[App] Checking user profile in Firestore...');
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          console.log('[App] New user — creating profile for UID:', user.uid);
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
          console.log('[App] ✅ New user profile created:', defaultUsername);

          await refreshQuests(user.uid, true);

          await addDoc(collection(db, 'activities'), {
            uid: user.uid,
            text: 'Joined Vantage! Welcome to the collection.',
            type: 'quest',
            timestamp: new Date().toISOString(),
          });
        } else {
          const data = userSnap.data() as UserProfile;
          console.log('[App] ✅ Existing user profile loaded. Username:', data.username, '| Chips:', data.chips);

          if (!data.username) {
            const baseUsername = (data.displayName || 'Collector').toLowerCase().replace(/\s+/g, '');
            const randomSuffix = Math.floor(1000 + Math.random() * 9000);
            await updateDoc(userRef, { username: `${baseUsername}${randomSuffix}` });
          }

          const today = new Date().toISOString().split('T')[0];
          if (data.lastQuestRefresh !== today) {
            console.log('[App] Quest refresh due (last:', data.lastQuestRefresh, '| today:', today, ')');
            await refreshQuests(user.uid, true);
          } else {
            console.log('[App] Quests up to date. Validating...');
            await refreshQuests(user.uid, false);
          }

          // ── Artist Reward (Vantage Blue) ──────────────────────────────────
          const creatorIdentifier = `@${data.username}`;
          const isArtist = INITIAL_PACKS.some(p => p.creator?.toLowerCase() === creatorIdentifier.toLowerCase());
          
          if (isArtist) {
            const blueQuery = query(collection(db, 'user_cards'), where('ownerUid', '==', user.uid), where('cardId', '==', 'vantage-blue'));
            const blueSnap = await getDocs(blueQuery);
            if (blueSnap.empty) {
              console.log('[App] Artist detected! Gifting Vantage Blue...');
              await addDoc(collection(db, 'user_cards'), {
                ownerUid: user.uid,
                cardId: 'vantage-blue',
                printNumber: 1,
                totalPrintRun: 999999,
                acquiredAt: new Date().toISOString(),
                originalOwnerName: data.displayName,
              });
              await addDoc(collection(db, 'activities'), {
                uid: user.uid,
                text: 'Received the Artist Reward: Vantage Blue!',
                type: 'quest',
                timestamp: new Date().toISOString(),
              });
            }
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[App] ❌ Error during profile setup:', msg, error);
        setFirebaseError(`Profile setup failed: ${msg}`);
        setLoading(false);
        return;
      }

      // ── Profile listener ─────────────────────────────────────────────────
      console.log('[App] Attaching profile listener...');
      unsubProfile = onSnapshot(
        userRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as UserProfile;
            console.log('[App/Profile] Profile updated. Chips:', data.chips, '| Level:', data.level);
            setUserProfile(data);
          }
        },
        (error) => {
          if (auth.currentUser) {
            console.error('[App/Profile] ❌ Profile listener error:', error);
            handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
          }
        }
      );

      // ── Cards listener ───────────────────────────────────────────────────
      console.log('[App] Attaching user_cards listener...');
      const cardsQuery = query(collection(db, 'user_cards'), where('ownerUid', '==', user.uid));
      unsubCards = onSnapshot(
        cardsQuery,
        async (snapshot) => {
          const invalidDocIds: string[] = [];
          const cards = snapshot.docs
            .map((docSnap) => {
              const data = docSnap.data();
              if (data.isHidden) return null;
              const cardDef = INITIAL_CARDS.find((c) => c.id === data.cardId);

              if (!cardDef || !data.ownerUid || typeof data.printNumber !== 'number') {
                console.warn('[App/Cards] Invalid card doc', docSnap.id, '— will hide. Missing cardDef:', !cardDef);
                invalidDocIds.push(docSnap.id);
                return null;
              }

              return { id: docSnap.id, ...data, card: cardDef } as UserCard;
            })
            .filter((uc): uc is UserCard => uc !== null);

          if (invalidDocIds.length > 0) {
            console.warn(`[App/Cards] Hiding ${invalidDocIds.length} invalid user card doc(s) for user ${user.uid}:`, invalidDocIds);
            invalidDocIds.forEach((id) => {
              updateDoc(doc(db, 'user_cards', id), { isHidden: true }).catch((err) =>
                console.error(`[App/Cards] Failed to hide invalid card doc ${id}:`, err)
              );
            });
          }

          console.log(`[App/Cards] Collection updated. Valid cards: ${cards.length}`);
          setUserCards(cards);
        },
        (error) => {
          if (auth.currentUser) {
            console.error('[App/Cards] ❌ user_cards listener error:', error);
            handleFirestoreError(error, OperationType.LIST, 'user_cards');
          }
        }
      );

      // ── Quests listener ──────────────────────────────────────────────────
      console.log('[App] Attaching quests listener...');
      const questsQuery = query(collection(db, 'quests'), where('uid', '==', user.uid));
      unsubQuests = onSnapshot(
        questsQuery,
        (snapshot) => {
          const qList = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Quest));
          console.log(`[App/Quests] Quests updated. Count: ${qList.length}`);
          setQuests(qList);
        },
        (error) => {
          if (auth.currentUser) {
            console.error('[App/Quests] ❌ quests listener error:', error);
            handleFirestoreError(error, OperationType.LIST, 'quests');
          }
        }
      );

      // ── Activities listener ──────────────────────────────────────────────
      console.log('[App] Attaching activities listener...');
      const activitiesQuery = query(collection(db, 'activities'), where('uid', '==', user.uid));
      unsubActivities = onSnapshot(
        activitiesQuery,
        (snapshot) => {
          const aList = snapshot.docs
            .map((d) => ({ id: d.id, ...d.data() } as Activity))
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          console.log(`[App/Activities] Activities updated. Count: ${aList.length}`);
          setActivities(aList);
        },
        (error) => {
          if (auth.currentUser) {
            console.error('[App/Activities] ❌ activities listener error:', error);
            handleFirestoreError(error, OperationType.LIST, 'activities');
          }
        }
      );

      // ── Market listings listener ─────────────────────────────────────────
      console.log('[App] Attaching market_listings listener...');
      const myListingsQuery = query(
        collection(db, 'market_listings'),
        where('sellerUid', '==', user.uid),
        where('active', '==', true)
      );
      unsubMyListings = onSnapshot(
        myListingsQuery,
        (snapshot) => {
          const ids = snapshot.docs.map((d) => d.data().userCardId);
          console.log(`[App/Market] Active listings updated. Count: ${ids.length}`);
          setUserListings(ids);
        },
        (error) => {
          if (auth.currentUser) {
            console.error('[App/Market] ❌ market_listings listener error:', error);
            handleFirestoreError(error, OperationType.LIST, 'market_listings');
          }
        }
      );

      // ── Pending trades listeners ─────────────────────────────────────────
      console.log('[App] Attaching pending trades listeners...');

      const pendingTradesSenderQuery = query(
        collection(db, 'trades'),
        where('senderUid', '==', user.uid),
        where('status', '==', 'pending')
      );
      unsubPendingTradesSender = onSnapshot(
        pendingTradesSenderQuery,
        (snapshot) => {
          const ids = snapshot.docs.flatMap((d) => d.data().senderCardIds || []);
          console.log(`[App/Trades] Pending outgoing trades updated. Card IDs in escrow: ${ids.length}`);
          setPendingSenderCardIds(ids);
        },
        (error) => {
          if (auth.currentUser) {
            console.error('[App/Trades] ❌ pending trades (sender) listener error:', error);
            handleFirestoreError(error, OperationType.LIST, 'trades');
          }
        }
      );

      const pendingTradesReceiverQuery = query(
        collection(db, 'trades'),
        where('receiverUid', '==', user.uid),
        where('status', '==', 'pending')
      );
      unsubPendingTradesReceiver = onSnapshot(
        pendingTradesReceiverQuery,
        (snapshot) => {
          const ids = snapshot.docs.flatMap((d) => d.data().receiverCardIds || []);
          console.log(`[App/Trades] Pending incoming trades updated. Card IDs in escrow: ${ids.length}`);
          setPendingReceiverCardIds(ids);
        },
        (error) => {
          if (auth.currentUser) {
            console.error('[App/Trades] ❌ pending trades (receiver) listener error:', error);
            handleFirestoreError(error, OperationType.LIST, 'trades');
          }
        }
      );

      // ── Accepted trades (quest progression) ─────────────────────────────
      const processTrades = (snapshot: any) => {
        const key = `processed_trades_${user.uid}`;
        const processed = JSON.parse(localStorage.getItem(key) || '[]');
        const newProcessed = [...processed];
        let changed = false;

        snapshot.docs.forEach((d: any) => {
          const data = d.data();
          if (!processed.includes(d.id)) {
            const isSender = data.senderUid === user.uid;
            const cardCount = isSender ? (data.senderCardIds?.length || 0) : (data.receiverCardIds?.length || 0);
            console.log(`[App/Trades] Processing accepted trade ${d.id} — card count: ${cardCount}`);
            progressQuest('trade', cardCount, user.uid);
            newProcessed.push(d.id);
            changed = true;
          }
        });

        if (changed) localStorage.setItem(key, JSON.stringify(newProcessed));
      };

      const tradesSenderQuery = query(
        collection(db, 'trades'),
        where('senderUid', '==', user.uid),
        where('status', '==', 'accepted')
      );
      unsubTradesSender = onSnapshot(tradesSenderQuery, processTrades, (error) => {
        if (auth.currentUser) {
          console.error('[App/Trades] ❌ accepted trades (sender) listener error:', error);
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
          console.error('[App/Trades] ❌ accepted trades (receiver) listener error:', error);
          handleFirestoreError(error, OperationType.LIST, 'trades');
        }
      });

      // ── Sales listener (payout crediting) ───────────────────────────────
      console.log('[App] Attaching sales listener...');
      const salesQuery = query(
        collection(db, 'sales'),
        where('sellerUid', '==', user.uid),
        where('processed', '==', false)
      );
      unsubSales = onSnapshot(
        salesQuery,
        async (snapshot) => {
          for (const sDoc of snapshot.docs) {
            const saleRef = doc(db, 'sales', sDoc.id);
            const userRef = doc(db, 'users', user.uid);
            try {
              let credited = false;
              await runTransaction(db, async (transaction) => {
                const saleSnap = await transaction.get(saleRef);
                if (!saleSnap.exists() || saleSnap.data().processed === true) return;
                const sale = saleSnap.data();
                console.log(`[App/Sales] Crediting payout for sale ${sDoc.id}. Amount: ${sale.payout}`);
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
                  timestamp: new Date().toISOString(),
                });
              }
            } catch (error) {
              console.error('[App/Sales] ❌ Error processing sale payout for', sDoc.id, ':', error);
            }
          }
        },
        (error) => {
          if (auth.currentUser) {
            console.error('[App/Sales] ❌ sales listener error:', error);
            handleFirestoreError(error, OperationType.LIST, 'sales');
          }
        }
      );

      // ── Purchases listener (quest progression for buyer) ─────────────────
      console.log('[App] Attaching purchases listener...');
      const purchasesQuery = query(collection(db, 'sales'), where('buyerUid', '==', user.uid));
      unsubPurchases = onSnapshot(
        purchasesQuery,
        async (snapshot) => {
          const key = `processed_purchases_${user.uid}`;
          const processed = JSON.parse(localStorage.getItem(key) || '[]');
          const newProcessed = [...processed];
          let changed = false;

          for (const pDoc of snapshot.docs) {
            const sale = pDoc.data();
            if (!processed.includes(pDoc.id)) {
              console.log(`[App/Purchases] New purchase detected: ${pDoc.id} for ${sale.price} chips`);
              progressQuest('buy_market', 1, user.uid);
              progressQuest('spend_chips', sale.price, user.uid);
              newProcessed.push(pDoc.id);
              changed = true;
            }
          }

          if (changed) localStorage.setItem(key, JSON.stringify(newProcessed));
        },
        (error) => {
          if (auth.currentUser) {
            console.error('[App/Purchases] ❌ purchases listener error:', error);
            handleFirestoreError(error, OperationType.LIST, 'sales');
          }
        }
      );

      console.log('[App] ✅ All Firestore listeners established.');
      setLoading(false);
    };

    setupListeners();

    return () => {
      console.log('[App] Tearing down all Firestore listeners for user:', user.uid);
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

  // ── Geolocation ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (user && userProfile) {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            const userRef = doc(db, 'users', user.uid);
            const lastUpdated = userProfile.location?.lastUpdated;
            const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();

            if (!lastUpdated || lastUpdated < oneHourAgo) {
              console.log('[App/Geo] Updating location for user:', user.uid);
              await updateDoc(userRef, {
                location: { lat: latitude, lng: longitude, lastUpdated: new Date().toISOString() },
              });
            }
          },
          (error) => {
            console.warn('[App/Geo] Geolocation error (non-critical):', error.message);
          }
        );
      }
    }
  }, [user, userProfile?.uid]);

  // ── Quest Helpers ────────────────────────────────────────────────────────
  const progressQuest = async (type: string, amount: number = 1, uid?: string) => {
    const targetUid = uid || user?.uid;
    if (!targetUid) return;
    try {
      const q = query(collection(db, 'quests'), where('uid', '==', targetUid), where('type', '==', type));
      const snap = await getDocs(q);

      if (snap.empty) {
        console.log(`[App/Quests] No active quests of type "${type}" for user ${targetUid}`);
        return;
      }

      for (const questDoc of snap.docs) {
        await runTransaction(db, async (transaction) => {
          const qSnap = await transaction.get(doc(db, 'quests', questDoc.id));
          if (!qSnap.exists()) return;
          const data = qSnap.data() as Quest;
          if (data.completed) return;
          const newProgress = Math.min(data.progress + amount, data.total);
          console.log(`[App/Quests] Progressing quest "${data.title}" (${type}): ${data.progress} → ${newProgress} / ${data.total}`);
          transaction.update(doc(db, 'quests', questDoc.id), {
            progress: newProgress,
            completed: newProgress >= data.total,
          });
        });
      }
    } catch (error) {
      console.error('[App/Quests] ❌ Error progressing quest type:', type, error);
    }
  };

  const refreshQuests = async (uid: string, force: boolean = false) => {
    const today = new Date().toISOString().split('T')[0];
    const userRef = doc(db, 'users', uid);
    const q = query(collection(db, 'quests'), where('uid', '==', uid));
    const snap = await getDocs(q);
    const existingQuests = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Quest));
    console.log(`[App/Quests] refreshQuests called. force=${force}, existing=${existingQuests.length}`);

    if (force) {
      for (const quest of existingQuests) {
        await deleteDoc(doc(db, 'quests', quest.id));
      }
    } else {
      const validIds = [
        ...QUEST_POOLS.easy,
        ...QUEST_POOLS.medium,
        ...QUEST_POOLS.hard,
      ].map((t) => t.questId);
      for (const quest of existingQuests) {
        if (!quest.completed && !validIds.includes(quest.questId)) {
          console.log('[App/Quests] Deleting invalid/stale quest:', quest.questId);
          await deleteDoc(doc(db, 'quests', quest.id));
        }
      }
    }

    const currentSnap = await getDocs(q);
    const currentQuests = currentSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Quest));

    const difficulties: ('easy' | 'medium' | 'hard')[] = ['easy', 'medium', 'hard'];
    for (const diff of difficulties) {
      const hasQuest = currentQuests.some((q) => q.difficulty === diff);
      if (!hasQuest) {
        const pool = QUEST_POOLS[diff];
        const template = pool[Math.floor(Math.random() * pool.length)];
        console.log(`[App/Quests] Adding new ${diff} quest: "${template.title}"`);
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
          claimed: false,
        });
      }
    }

    await updateDoc(userRef, { lastQuestRefresh: today });
    console.log('[App/Quests] Quest refresh complete for date:', today);
  };

  // ── Pack Handlers ────────────────────────────────────────────────────────
  const handleOpenPack = (packId: string, cost: number, count: number = 1) => {
    if (userProfile && userProfile.chips >= cost) {
      console.log(`[App/Pack] Opening pack "${packId}" × ${count}. Cost: ${cost}`);
      setOpeningPack({ id: packId, cost, count });
    } else {
      console.warn('[App/Pack] Insufficient chips. Have:', userProfile?.chips, '| Need:', cost);
    }
  };

  const handleAddCards = async (newCards: Card[]) => {
    if (!user || !userProfile || isAddingCards || !openingPack) return;
    setIsAddingCards(true);
    console.log(`[App/Pack] Adding ${newCards.length} pulled card(s) to Firestore. Pack cost: ${openingPack.cost}`);

    try {
      const packCost = openingPack.cost;
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { chips: Math.max(0, userProfile.chips - packCost) });

      let currentLastRarity = lastRarity;
      let currentStreak = rarityStreak;

      for (const card of newCards) {
        const q = query(collection(db, 'user_cards'), where('cardId', '==', card.id));
        const snap = await getDocs(q);
        const nums = snap.docs.map((d) => d.data().printNumber as number).filter((n) => typeof n === 'number').sort((a, b) => a - b);
        let assignedPrintNumber = 1;
        for (const num of nums) {
          if (num === assignedPrintNumber) assignedPrintNumber++;
          else if (num > assignedPrintNumber) break;
        }

        console.log(`[App/Pack] Saving card "${card.name}" with print #${assignedPrintNumber}`);
        await addDoc(collection(db, 'user_cards'), {
          ownerUid: user.uid,
          cardId: card.id,
          printNumber: assignedPrintNumber,
          totalPrintRun: card.totalPrintRun,
          acquiredAt: new Date().toISOString(),
          originalOwnerName: userProfile.displayName,
        });

        await addDoc(collection(db, 'activities'), {
          uid: user.uid,
          text: `Pulled ${card.name} #${assignedPrintNumber} from a pack!`,
          type: 'pack',
          timestamp: new Date().toISOString(),
        });

        if (card.rarity === 'Rare' || card.rarity === 'Legendary') {
          await progressQuest('get_rare_legendary', 1);
        }

        if (currentLastRarity === card.rarity) {
          currentStreak++;
          if (currentStreak >= 2) await progressQuest('same_rarity_streak', 1);
        } else {
          currentStreak = 1;
          currentLastRarity = card.rarity;
        }
      }

      setLastRarity(currentLastRarity);
      setRarityStreak(currentStreak);
      await progressQuest('open_pack', 1);
      await progressQuest('spend_chips', packCost);
      console.log('[App/Pack] ✅ Cards saved successfully.');
    } catch (error) {
      console.error('[App/Pack] ❌ Error saving pulled cards:', error);
    } finally {
      setIsAddingCards(false);
    }
  };

  const handleClosePack = () => {
    console.log('[App/Pack] Pack session closed. Returning to collection.');
    setOpeningPack(null);
    setActiveTab('collection');
  };

  // ── Rare Pairs chip earning ──────────────────────────────────────────────
  const handleRarePairsEarnChips = async (amount: number) => {
    if (!user || !userProfile) return;
    console.log(`[App/RarePairs] Awarding ${amount} chips for win. Current: ${userProfile.chips}`);
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { chips: increment(amount) });
      await addDoc(collection(db, 'activities'), {
        uid: user.uid,
        text: `Won ${amount} chips playing Rare Pairs! (Streak: ${rarePairsStreak + 1})`,
        type: 'quest',
        timestamp: new Date().toISOString(),
      });
      console.log(`[App/RarePairs] ✅ Chips awarded. New balance: ${userProfile.chips + amount}`);
    } catch (error) {
      console.error('[App/RarePairs] ❌ Error awarding chips:', error);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  // IMPORTANT: Firebase error → show error screen, NOT a fake app (see guidelines.md)
  if (firebaseError) {
    console.error('[App] Rendering FirebaseErrorScreen due to error:', firebaseError);
    return <FirebaseErrorScreen error={firebaseError} />;
  }

  if (loading || (user && !userProfile)) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Sparkles className="w-12 h-12 text-emerald-400 animate-pulse" />
          <p className="text-emerald-400/60 font-mono text-sm tracking-widest uppercase">
            Initializing Vantage...
          </p>
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

  const enrichedUserCards = userCards.map((card) => ({
    ...card,
    isForSale: userListings.includes(card.id),
    isPendingTrade:
      pendingSenderCardIds.includes(card.id) || pendingReceiverCardIds.includes(card.id),
  }));

  // Rare Pairs shown as full-screen overlay over the collection tab
  if (showRarePairs) {
    return (
      <Layout activeTab="collection" setActiveTab={setActiveTab} chips={userProfile?.chips || 0} userPhotoURL={userProfile?.photoURL}>
        <RarePairs
          collection={enrichedUserCards}
          chips={userProfile?.chips || 0}
          onEarnChips={handleRarePairsEarnChips}
          streak={rarePairsStreak}
          setStreak={setRarePairsStreak}
          onBack={() => {
            console.log('[App/RarePairs] Exiting Rare Pairs, returning to collection.');
            setShowRarePairs(false);
          }}
        />
      </Layout>
    );
  }

  const renderScreen = () => {
    if (openingPack) {
      return (
        <PackOpening
          packId={openingPack.id}
          packCost={openingPack.cost}
          userChips={userProfile?.chips || 0}
          onAddCards={handleAddCards}
          onClose={handleClosePack}
          onCancel={() => {
            console.log('[App/Pack] Pack opening cancelled by user.');
            setOpeningPack(null);
          }}
          count={openingPack.count}
        />
      );
    }

    switch (activeTab) {
      case 'home':
        return <Home user={userProfile!} quests={quests} onOpenPack={handleOpenPack} />;
      case 'collection':
        return (
          <Collection
            collection={enrichedUserCards}
            onProgressQuest={progressQuest}
            onPlayRarePairs={() => {
              console.log('[App] Launching Rare Pairs from Collection tab.');
              setShowRarePairs(true);
            }}
          />
        );
      case 'market':
        return <Marketplace user={userProfile!} collection={enrichedUserCards} onProgressQuest={progressQuest} />;
      case 'trades':
        return <Trades user={userProfile!} collection={enrichedUserCards} onProgressQuest={progressQuest} />;
      case 'money':
        return <Money user={userProfile!} />;
      case 'profile':
        return (
          <Profile
            user={userProfile!}
            collection={enrichedUserCards}
            activities={activities}
            onLogout={logout}
            setActiveTab={setActiveTab}
          />
        );
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
