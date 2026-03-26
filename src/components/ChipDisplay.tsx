import React from 'react';
import { Coins } from 'lucide-react';

interface ChipDisplayProps {
  amount: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const ChipDisplay: React.FC<ChipDisplayProps> = ({ amount, size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'text-sm gap-1',
    md: 'text-lg gap-1.5',
    lg: 'text-3xl gap-2 font-display font-bold',
  };

  const iconSizes = {
    sm: 14,
    md: 18,
    lg: 28,
  };

  return (
    <div className={`flex items-center text-amber-400 ${sizeClasses[size]} ${className}`}>
      <Coins size={iconSizes[size]} className="drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
      <span>{amount.toLocaleString()}</span>
    </div>
  );
};
