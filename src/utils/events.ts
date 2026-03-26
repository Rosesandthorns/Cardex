/**
 * Utility to handle EST-based event logic
 */

export const getESTDate = () => {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
};

export enum EventType {
  MONEY_MONDAY = 'Money Monday',
  MARKETPLACE_CELEBRATION = 'Marketplace Celebration',
  GATCHA_WEEKEND = 'Gatcha Weekend',
  NONE = 'None'
}

export const getCurrentEvent = () => {
  const estDate = getESTDate();
  const day = estDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  if (day === 1) return EventType.MONEY_MONDAY;
  if (day === 4) return EventType.MARKETPLACE_CELEBRATION;
  if (day === 0 || day === 6) return EventType.GATCHA_WEEKEND;
  return EventType.NONE;
};

export const getMarketplaceTax = () => {
  const event = getCurrentEvent();
  const baseTax = 0.05; // 5%
  if (event === EventType.MARKETPLACE_CELEBRATION) {
    return baseTax / 2; // 2.5%
  }
  return baseTax;
};

export const getPackPrice = (basePrice: number) => {
  const event = getCurrentEvent();
  if (event === EventType.GATCHA_WEEKEND) {
    return Math.floor(basePrice * 0.75);
  }
  return basePrice;
};

export const getDailyBonusMultiplier = (packsCreated: number = 0) => {
  const event = getCurrentEvent();
  const creatorBonus = 1 + (packsCreated * 0.1);
  if (event === EventType.MONEY_MONDAY) return creatorBonus * 3;
  return creatorBonus;
};

export const getQuestRewardMultiplier = (packsCreated: number = 0) => {
  const event = getCurrentEvent();
  const creatorBonus = 1 + (packsCreated * 0.1);
  if (event === EventType.MONEY_MONDAY) return creatorBonus * 2;
  return creatorBonus;
};
