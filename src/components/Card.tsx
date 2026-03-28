import React from 'react';
import { motion } from 'motion/react';
import { Rarity, Card as CardType, UserCard } from '../types';
import { RARITY_CONFIG } from '../constants';
import { ArrowLeftRight, Tag } from 'lucide-react';

interface CardProps {
  card: CardType | UserCard;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  onClick?: () => void;
  showCount?: boolean;
}

export const Card: React.FC<CardProps> = ({ card, size = 'md', onClick, showCount }) => {
  const isUserCard = 'cardId' in card;
  const cardData = isUserCard ? (card as UserCard).card : (card as CardType);
  
  if (!cardData) return null;

  const config = RARITY_CONFIG[cardData.rarity];
  
  const sizeClasses = {
    sm: 'w-24 h-36 text-[8px]',
    md: 'w-40 h-60 text-xs',
    lg: 'w-64 h-96 text-sm',
    xl: 'w-80 h-[480px] text-base',
  };

  const printNumber = isUserCard ? (card as UserCard).printNumber : null;

  return (
    <motion.div
      whileHover={{ scale: 1.05, y: -5 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`relative cursor-pointer rounded-xl overflow-hidden border-2 ${config.frame} ${sizeClasses[size]} flex flex-col bg-zinc-900 group ${cardData.rarity === Rarity.LIMITED ? 'card-holographic' : ''}`}
    >
      {/* Card Illustration */}
      <div className="flex-grow relative overflow-hidden">
        <img 
          src={cardData.image || `https://picsum.photos/seed/${cardData.id}/400/600`}
          alt={cardData.name}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
        
        {/* Always show status icons */}
        <div className="absolute top-2 left-2 flex flex-col gap-1.5 z-30">
          {isUserCard && (card as UserCard).isPendingTrade && (
            <div className="p-1.5 rounded-lg bg-blue-500 text-white shadow-lg shadow-blue-500/40">
              <ArrowLeftRight size={size === 'sm' ? 10 : 14} />
            </div>
          )}
          {isUserCard && (card as UserCard).isForSale && (
            <div className="p-1.5 rounded-lg bg-rose-500 text-white shadow-lg shadow-rose-500/40">
              <Tag size={size === 'sm' ? 10 : 14} />
            </div>
          )}
        </div>

        {cardData.rarity === Rarity.LIMITED && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-white text-black text-[10px] font-bold uppercase tracking-wider z-30 shadow-sm">
            {cardData.rarity}
          </div>
        )}

        {!cardData.isFullArt && (
          <>
            <div className={`absolute inset-0 bg-gradient-to-t from-zinc-900/80 to-transparent opacity-60`} />
            {cardData.rarity === Rarity.LEGENDARY && <div className="absolute inset-0 card-shimmer opacity-50" />}
            
            {/* Rarity Badge */}
            <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/40 backdrop-blur-sm text-[10px] font-bold uppercase tracking-wider">
              {cardData.rarity}
            </div>
          </>
        )}

        {/* Dynamic Description for Limited Cards */}
        {cardData.rarity === Rarity.LIMITED && cardData.description && (
          <div className="absolute bottom-0 left-0 right-0 p-3 bg-black/60 backdrop-blur-md border-t border-white/10 z-20">
            <p className="text-[10px] leading-tight text-white font-medium italic">
              {cardData.description
                .replace('{owner}', (card as UserCard).originalOwnerName || 'a Collector')
                .replace('{artist}', (card as UserCard).originalOwnerName || 'an Artist')}
            </p>
          </div>
        )}
      </div>

      {/* Card Info */}
      {!cardData.isFullArt && cardData.rarity !== Rarity.LIMITED && (
        <div className="p-3 bg-zinc-800/80 backdrop-blur-sm border-t border-white/5">
          <h3 className="font-display font-bold truncate mb-1 text-white">{cardData.name}</h3>
          <div className="flex justify-between items-end opacity-80">
            <span className="font-mono text-zinc-400">
              {typeof printNumber === 'number' ? (
                <>
                  <span className="font-bold text-white">#{printNumber}</span>
                  <span className="mx-1">/</span>
                  <span>{cardData.totalPrintRun}</span>
                </>
              ) : (
                <span>Run: {cardData.totalPrintRun}</span>
              )}
            </span>
            <span className="text-[10px] uppercase tracking-tighter opacity-50 text-zinc-500">{cardData.packName}</span>
          </div>
        </div>
      )}
    </motion.div>
  );
};
