export enum Rarity {
  COMMON = 'Common',
  UNCOMMON = 'Uncommon',
  RARE = 'Rare',
  LEGENDARY = 'Legendary',
}

export interface Card {
  id: string;
  name: string;
  rarity: Rarity;
  totalPrintRun: number;
  packName: string;
  image: string;
  isFullArt?: boolean;
}

export interface UserCard {
  id: string;
  ownerUid: string;
  cardId: string;
  printNumber: number;
  acquiredAt: string;
  // Joined data for UI
  card?: Card;
  isForSale?: boolean;
  isPendingTrade?: boolean;
}

export interface Pack {
  id: string;
  name: string;
  price: number;
  description: string;
  color: string;
  image?: string;
  creator: string;
  pullOdds?: {
    [key in Rarity]?: number;
  };
}

export interface Quest {
  id: string;
  uid: string;
  questId: string;
  title: string;
  progress: number;
  total: number;
  reward: number;
  completed: boolean;
  claimed: boolean;
  difficulty: 'easy' | 'medium' | 'hard';
  type: string;
}

export interface Activity {
  id: string;
  uid: string;
  text: string;
  type: 'pack' | 'trade' | 'quest' | 'market';
  timestamp: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  username: string;
  photoURL: string;
  chips: number;
  xp: number;
  level: number;
  dailyLoginLastClaimed?: string;
  dailyLoginStreak?: number;
  lastQuestRefresh?: string;
  hourlyEarnings?: number;
  lastHourlyReset?: string;
  joinDate: string;
  showcaseCardIds?: string[];
  location?: {
    lat: number;
    lng: number;
    lastUpdated: string;
  };
}

export interface MarketListing {
  id: string;
  userCardId: string;
  sellerUid: string;
  price: number;
  active: boolean;
  createdAt: string;
  // Joined data for UI
  userCard?: UserCard;
}

export interface TradeOffer {
  id: string;
  senderUid: string;
  receiverUid: string;
  senderCardIds: string[];
  receiverCardIds: string[];
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  createdAt: string;
  // Joined data for UI
  senderCards?: UserCard[];
  receiverCards?: UserCard[];
}
