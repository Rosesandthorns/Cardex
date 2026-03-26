import { Rarity, Card, Pack, Quest } from './types';

export const RARITY_CONFIG = {
  [Rarity.COMMON]: {
    printRun: 1000,
    color: 'from-slate-400 to-slate-600',
    frame: 'border-slate-400',
    glow: '',
  },
  [Rarity.UNCOMMON]: {
    printRun: 100,
    color: 'from-emerald-400 to-teal-600',
    frame: 'border-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]',
    glow: 'shadow-emerald-500/10',
  },
  [Rarity.RARE]: {
    printRun: 10,
    color: 'from-blue-500 to-purple-600',
    frame: 'border-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.5)]',
    glow: 'shadow-blue-500/20',
  },
  [Rarity.LEGENDARY]: {
    printRun: 1,
    color: 'from-amber-400 via-orange-500 to-amber-600',
    frame: 'border-amber-400 border-4 shadow-[0_0_25px_rgba(251,191,36,0.8)]',
    glow: 'shadow-amber-500/60',
  },
};

const GITHUB_BASE_URL = '';

export const INITIAL_PACKS: Pack[] = [
  { 
    id: 'pixl-wave-1', 
    name: 'Pixl: Wave I', 
    price: 500, 
    description: '32 bit recreations of legally distinct characters', 
    color: 'from-green-400 to-blue-500',
    image: `${GITHUB_BASE_URL}/pixl-pack.png`,
    creator: 'rosesandthorns',
    pullOdds: {
      [Rarity.COMMON]: 50,
      [Rarity.UNCOMMON]: 30,
      [Rarity.RARE]: 19.75,
      [Rarity.LEGENDARY]: 0.25,
    }
  },
  { 
    id: 'fruit-frog-pack', 
    name: 'Fruit Frog Pack', 
    price: 200, 
    description: 'A collection of delicious and amphibious friends.', 
    color: 'from-lime-400 to-emerald-600',
    image: `${GITHUB_BASE_URL}/FruitFrog.png`,
    creator: 'rosesandthorns',
    pullOdds: {
      [Rarity.COMMON]: 40,
      [Rarity.UNCOMMON]: 35,
      [Rarity.RARE]: 24.75,
      [Rarity.LEGENDARY]: 0.25,
    }
  },
  { 
    id: 'doodles-pack', 
    name: 'Doodles', 
    price: 20, 
    description: 'Scribbles come to life', 
    color: 'from-slate-200 to-slate-400',
    image: `${GITHUB_BASE_URL}/Doodleee.png`,
    creator: 'rosesandthorns',
    pullOdds: {
      [Rarity.COMMON]: 90,
      [Rarity.UNCOMMON]: 8,
      [Rarity.RARE]: 1.995,
      [Rarity.LEGENDARY]: 0.005,
    }
  },
  { 
    id: 'gambit-pack', 
    name: 'Gambit Pack', 
    price: 150, 
    description: 'A high-stakes roll. Picks a random pack and pulls from its collection.', 
    color: 'from-indigo-500 via-purple-500 to-pink-500',
    creator: '',
    // No image property as requested
  },
  { 
    id: 'emotions-pack', 
    name: 'Emotions', 
    price: 125, 
    description: 'A collection of expressive faces.', 
    color: 'from-yellow-400 to-orange-500',
    image: `${GITHUB_BASE_URL}/Emotions.png`,
    creator: 'rosesandthorns',
    pullOdds: {
      [Rarity.COMMON]: 60,
      [Rarity.UNCOMMON]: 30,
      [Rarity.RARE]: 10,
      [Rarity.LEGENDARY]: 0,
    }
  },
  { 
    id: 'disgrace-pack', 
    name: 'Disgrace', 
    price: 250, 
    description: 'Sins crawling on your- wrong game.', 
    color: 'from-rose-900 via-zinc-900 to-black',
    image: `${GITHUB_BASE_URL}/disgrace.png`,
    creator: 'Pablosun',
    pullOdds: {
      [Rarity.COMMON]: 65,
      [Rarity.UNCOMMON]: 20,
      [Rarity.RARE]: 14.95,
      [Rarity.LEGENDARY]: 0.05,
    }
  },
];

export const INITIAL_CARDS: Card[] = [
  { id: 'pixl-len', name: 'Pixel Len', rarity: Rarity.COMMON, totalPrintRun: 1000, packName: 'Pixl: Wave I', image: `${GITHUB_BASE_URL}/pixel-len.png` },
  { id: 'pixl-rin', name: 'Pixel Rin', rarity: Rarity.COMMON, totalPrintRun: 1000, packName: 'Pixl: Wave I', image: `${GITHUB_BASE_URL}/pixel-rin.png` },
  { id: 'pixl-gumi', name: 'Pixel Gumi', rarity: Rarity.UNCOMMON, totalPrintRun: 100, packName: 'Pixl: Wave I', image: `${GITHUB_BASE_URL}/pixel-gumi.png` },
  { id: 'pixl-teto', name: 'Pixel Teto', rarity: Rarity.UNCOMMON, totalPrintRun: 100, packName: 'Pixl: Wave I', image: `${GITHUB_BASE_URL}/pixel-teto.png` },
  { id: 'pixl-luka', name: 'Pixel Luka', rarity: Rarity.RARE, totalPrintRun: 10, packName: 'Pixl: Wave I', image: `${GITHUB_BASE_URL}/pixel-luka.png` },
  { id: 'pixl-miku', name: 'Pixel Miku', rarity: Rarity.LEGENDARY, totalPrintRun: 1, packName: 'Pixl: Wave I', image: `${GITHUB_BASE_URL}/pixel-miku.png` },
  
  // Fruit Frog Pack - Common
  { id: 'frog-lemon', name: 'Lemon Frog', rarity: Rarity.COMMON, totalPrintRun: 1000, packName: 'Fruit Frog Pack', image: `${GITHUB_BASE_URL}/Lemon.png` },
  { id: 'frog-tomato', name: 'Tomato Frog', rarity: Rarity.COMMON, totalPrintRun: 1000, packName: 'Fruit Frog Pack', image: `${GITHUB_BASE_URL}/Tomato.png` },
  { id: 'frog-pomegranate', name: 'Pomegranate Frog', rarity: Rarity.COMMON, totalPrintRun: 1000, packName: 'Fruit Frog Pack', image: `${GITHUB_BASE_URL}/Pommegranette.png` },
  
  // Fruit Frog Pack - Uncommon
  { id: 'frog-apple', name: 'Apple Frog', rarity: Rarity.UNCOMMON, totalPrintRun: 100, packName: 'Fruit Frog Pack', image: `${GITHUB_BASE_URL}/Apple.png` },
  { id: 'frog-green-apple', name: 'Green Apple Frog', rarity: Rarity.UNCOMMON, totalPrintRun: 100, packName: 'Fruit Frog Pack', image: `${GITHUB_BASE_URL}/Greenapple.png` },
  { id: 'frog-lime', name: 'Lime Frog', rarity: Rarity.UNCOMMON, totalPrintRun: 100, packName: 'Fruit Frog Pack', image: `${GITHUB_BASE_URL}/Lime.png` },
  { id: 'frog-blood-orange', name: 'Blood Orange Frog', rarity: Rarity.UNCOMMON, totalPrintRun: 100, packName: 'Fruit Frog Pack', image: `${GITHUB_BASE_URL}/BloodOrange.png` },
  { id: 'frog-avocado', name: 'Avocado Frog', rarity: Rarity.UNCOMMON, totalPrintRun: 100, packName: 'Fruit Frog Pack', image: `${GITHUB_BASE_URL}/Avacado.png` },
  
  // Fruit Frog Pack - Rare
  { id: 'frog-dragonfruit', name: 'Dragonfruit Frog', rarity: Rarity.RARE, totalPrintRun: 10, packName: 'Fruit Frog Pack', image: `${GITHUB_BASE_URL}/Dragonfruit.png` },
  { id: 'frog-watermelon', name: 'Watermelon Frog', rarity: Rarity.RARE, totalPrintRun: 10, packName: 'Fruit Frog Pack', image: `${GITHUB_BASE_URL}/Melon.png` },
  { id: 'frog-green-grape', name: 'Green Grape Frog', rarity: Rarity.RARE, totalPrintRun: 10, packName: 'Fruit Frog Pack', image: `${GITHUB_BASE_URL}/GreenGrape.png` },
  { id: 'frog-pear', name: 'Pear Frog', rarity: Rarity.RARE, totalPrintRun: 10, packName: 'Fruit Frog Pack', image: `${GITHUB_BASE_URL}/Pear.png` },
  
  // Fruit Frog Pack - Legendary
  { id: 'frog-cherry-tomato', name: 'Cherry Tomato Frog', rarity: Rarity.LEGENDARY, totalPrintRun: 1, packName: 'Fruit Frog Pack', image: `${GITHUB_BASE_URL}/CherryTomato.png` },
  { id: 'frog-cherry', name: 'Cherry Frog', rarity: Rarity.LEGENDARY, totalPrintRun: 1, packName: 'Fruit Frog Pack', image: `${GITHUB_BASE_URL}/Cherry.png` },

  // Doodles Pack - Common
  { id: 'doodle-1', name: 'Doodle', rarity: Rarity.COMMON, totalPrintRun: 1000, packName: 'Doodles', image: `${GITHUB_BASE_URL}/Doodle.png` },
  { id: 'doodle-2', name: 'Doodler', rarity: Rarity.COMMON, totalPrintRun: 1000, packName: 'Doodles', image: `${GITHUB_BASE_URL}/Doodle2.png` },
  { id: 'doodle-3', name: 'Doodlede', rarity: Rarity.COMMON, totalPrintRun: 1000, packName: 'Doodles', image: `${GITHUB_BASE_URL}/Doodle3.png` },
  { id: 'doodle-4', name: 'Dodle', rarity: Rarity.COMMON, totalPrintRun: 1000, packName: 'Doodles', image: `${GITHUB_BASE_URL}/Doodle4.png` },
  { id: 'doodle-5', name: 'Daadle', rarity: Rarity.COMMON, totalPrintRun: 1000, packName: 'Doodles', image: `${GITHUB_BASE_URL}/Doodle5.png` },
  { id: 'doodle-6', name: 'Dooodle', rarity: Rarity.COMMON, totalPrintRun: 1000, packName: 'Doodles', image: `${GITHUB_BASE_URL}/Doodle6.png` },
  { id: 'doodle-7', name: 'Dringle', rarity: Rarity.COMMON, totalPrintRun: 1000, packName: 'Doodles', image: `${GITHUB_BASE_URL}/Doodle7.png` },

  // Doodles Pack - Uncommon
  { id: 'doodle-dog', name: 'Doodle Dog', rarity: Rarity.UNCOMMON, totalPrintRun: 100, packName: 'Doodles', image: `${GITHUB_BASE_URL}/DoodleDog.png` },
  { id: 'doodle-cat', name: 'Doodle Cat', rarity: Rarity.UNCOMMON, totalPrintRun: 100, packName: 'Doodles', image: `${GITHUB_BASE_URL}/Doodlecat.png` },
  { id: 'doodle-swirl', name: 'Doodle Swirl', rarity: Rarity.UNCOMMON, totalPrintRun: 100, packName: 'Doodles', image: `${GITHUB_BASE_URL}/Doodleswirl.png` },

  // Doodles Pack - Rare
  { id: 'doodle-red', name: 'Doodle Red', rarity: Rarity.RARE, totalPrintRun: 10, packName: 'Doodles', image: `${GITHUB_BASE_URL}/Doodlered.png` },
  { id: 'doodle-melt', name: 'Doodle Melt', rarity: Rarity.RARE, totalPrintRun: 10, packName: 'Doodles', image: `${GITHUB_BASE_URL}/Doodlemelt.png` },

  // Doodles Pack - Legendary
  { id: 'doodle-small', name: 'Doodle Small', rarity: Rarity.LEGENDARY, totalPrintRun: 1, packName: 'Doodles', image: `${GITHUB_BASE_URL}/Doodlesmall.png` },

  // Emotions Pack - Common
  { id: 'emotion-smiley', name: 'Smiley', rarity: Rarity.COMMON, totalPrintRun: 1000, packName: 'Emotions', image: `${GITHUB_BASE_URL}/Smiley.png` },
  { id: 'emotion-shocked', name: 'Shocked', rarity: Rarity.COMMON, totalPrintRun: 1000, packName: 'Emotions', image: `${GITHUB_BASE_URL}/Shocked.png` },
  { id: 'emotion-uneasy', name: 'Uneasy', rarity: Rarity.COMMON, totalPrintRun: 1000, packName: 'Emotions', image: `${GITHUB_BASE_URL}/Uneasy.png` },
  
  // Emotions Pack - Uncommon
  { id: 'emotion-crazed', name: 'Crazed', rarity: Rarity.UNCOMMON, totalPrintRun: 100, packName: 'Emotions', image: `${GITHUB_BASE_URL}/Crazed.png` },
  { id: 'emotion-determined', name: 'Determined', rarity: Rarity.UNCOMMON, totalPrintRun: 100, packName: 'Emotions', image: `${GITHUB_BASE_URL}/Determined.png` },
  { id: 'emotion-sad', name: 'Sad', rarity: Rarity.UNCOMMON, totalPrintRun: 100, packName: 'Emotions', image: `${GITHUB_BASE_URL}/Sad.png` },
  
  // Emotions Pack - Rare
  { id: 'emotion-content', name: 'Content', rarity: Rarity.RARE, totalPrintRun: 10, packName: 'Emotions', image: `${GITHUB_BASE_URL}/Content.png` },
  { id: 'emotion-mischivious', name: 'Mischivious', rarity: Rarity.RARE, totalPrintRun: 10, packName: 'Emotions', image: `${GITHUB_BASE_URL}/Mischivious.png` },
  { id: 'emotion-sleepy', name: 'Sleepy', rarity: Rarity.RARE, totalPrintRun: 10, packName: 'Emotions', image: `${GITHUB_BASE_URL}/Sleepy.png` },

  // Disgrace Pack
  { id: 'disgrace-weird-bird', name: 'Weird Bird', rarity: Rarity.COMMON, totalPrintRun: 1000, packName: 'Disgrace', image: `${GITHUB_BASE_URL}/weirdbird.png` },
  { id: 'disgrace-lotus', name: 'Lotus', rarity: Rarity.COMMON, totalPrintRun: 1000, packName: 'Disgrace', image: `${GITHUB_BASE_URL}/lotus.png` },
  { id: 'disgrace-clock-thing', name: 'Clock Thing', rarity: Rarity.UNCOMMON, totalPrintRun: 100, packName: 'Disgrace', image: `${GITHUB_BASE_URL}/clockthing.png` },
  { id: 'disgrace-wake', name: 'Wake', rarity: Rarity.RARE, totalPrintRun: 10, packName: 'Disgrace', image: `${GITHUB_BASE_URL}/wake.png` },
  { id: 'disgrace-food-colouring', name: 'Food Colouring', rarity: Rarity.RARE, totalPrintRun: 10, packName: 'Disgrace', image: `${GITHUB_BASE_URL}/foodcolouring.png` },
  { id: 'disgrace-ice-cream', name: 'Ice Cream', rarity: Rarity.RARE, totalPrintRun: 10, packName: 'Disgrace', image: `${GITHUB_BASE_URL}/icecream.png` },
  { id: 'disgrace-sins', name: 'Sins', rarity: Rarity.LEGENDARY, totalPrintRun: 1, packName: 'Disgrace', image: `${GITHUB_BASE_URL}/sinsundertale.png` },
  { id: 'disgrace-man-upstairs', name: 'Man Upstairs', rarity: Rarity.LEGENDARY, totalPrintRun: 1, packName: 'Disgrace', image: `${GITHUB_BASE_URL}/manupstairs.png` },
  { id: 'disgrace-broken-camera', name: 'Broken Camera', rarity: Rarity.LEGENDARY, totalPrintRun: 1, packName: 'Disgrace', image: `${GITHUB_BASE_URL}/brokencamera.png` },
];

export const INITIAL_QUESTS: Omit<Quest, 'uid' | 'id'>[] = [];

export interface QuestTemplate {
  questId: string;
  title: string;
  total: number;
  reward: number;
  difficulty: 'easy' | 'medium' | 'hard';
  type: string;
}

export const QUEST_POOLS: { [key in 'easy' | 'medium' | 'hard']: QuestTemplate[] } = {
  easy: [
    { questId: 'e1', title: 'Trade a card', total: 1, reward: 300, difficulty: 'easy', type: 'trade' },
    { questId: 'e2', title: 'Gift a card', total: 1, reward: 300, difficulty: 'easy', type: 'gift' },
    { questId: 'e3', title: 'Buy a card off of the market', total: 1, reward: 300, difficulty: 'easy', type: 'buy_market' },
    { questId: 'e4', title: 'Open a pack', total: 1, reward: 300, difficulty: 'easy', type: 'open_pack' },
  ],
  medium: [
    { questId: 'm1', title: 'Have a card sell on the market', total: 1, reward: 500, difficulty: 'medium', type: 'sell_market' },
    { questId: 'm2', title: 'Get a Rare or Legendary card from a pack', total: 1, reward: 500, difficulty: 'medium', type: 'get_rare_legendary' },
    { questId: 'm3', title: 'Spend 300 chips on the economy', total: 300, reward: 500, difficulty: 'medium', type: 'spend_chips' },
    { questId: 'm4', title: 'Get the same rarity 2 times in a row from packs', total: 1, reward: 500, difficulty: 'medium', type: 'same_rarity_streak' },
  ],
  hard: [
    { questId: 'h1', title: 'Gift 4 cards', total: 4, reward: 1250, difficulty: 'hard', type: 'gift' },
    { questId: 'h2', title: 'Trade 6 cards', total: 6, reward: 1250, difficulty: 'hard', type: 'trade' },
    { questId: 'h3', title: 'Buy 10 packs', total: 10, reward: 1250, difficulty: 'hard', type: 'open_pack' },
    { questId: 'h4', title: 'Use 800 chips on the economy', total: 800, reward: 1250, difficulty: 'hard', type: 'spend_chips' },
  ],
};
