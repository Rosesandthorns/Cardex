import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  HelpCircle, 
  ChevronDown, 
  Rocket, 
  Layers, 
  RefreshCw, 
  ShoppingBag, 
  ArrowLeftRight, 
  Coins, 
  User, 
  AlertCircle,
  Clock,
  Calendar
} from 'lucide-react';

interface FAQItemProps {
  question: string;
  answer: React.ReactNode;
  icon?: React.ReactNode;
}

const FAQItem: React.FC<FAQItemProps> = ({ question, answer, icon }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-white/5 last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-6 flex items-start justify-between text-left group transition-colors hover:text-indigo-400"
      >
        <div className="flex gap-4">
          {icon && <div className="mt-1 text-slate-500 group-hover:text-indigo-400 transition-colors">{icon}</div>}
          <span className="text-lg font-bold text-white group-hover:text-indigo-400 transition-colors">{question}</span>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          className="mt-1 text-slate-500"
        >
          <ChevronDown size={20} />
        </motion.div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pb-6 pl-14 text-slate-400 leading-relaxed whitespace-pre-line">
              {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const FAQ: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-16 pb-20">
      <div className="text-center space-y-4">
        <h2 className="text-5xl font-display font-bold text-white tracking-tight">FAQ</h2>
        <p className="text-slate-400 text-lg">Everything you need to know about Vantage.</p>
      </div>

      {/* Getting Started */}
      <section className="space-y-6">
        <div className="flex items-center gap-3 text-indigo-400">
          <Rocket size={24} />
          <h3 className="text-2xl font-display font-bold uppercase tracking-widest">Getting Started</h3>
        </div>
        <div className="bg-navy-800/50 rounded-[32px] border border-white/5 px-8">
          <FAQItem 
            question="What is Vantage?" 
            answer="Vantage is a project made and handled currently by a solo dev, where you gather unique cards - imagine NFT's but actually not worth anything objectively." 
          />
          <FAQItem 
            question="How do I earn Chips?" 
            answer={`Chips can be earned by selling cards on the marketplace, daily bonuses, or daily quests.\n\nCreating a pack of cards contributes to bonus daily Chips.`} 
          />
          <FAQItem 
            question="What are packs and how do I open them?" 
            answer="Packs are what cards come from, they have different odds for different rarities and cost various amounts, different packs have different amounts." 
          />
          <FAQItem 
            question="Do I need to spend real money?" 
            answer={`There is physically no option to spend real money.\nIf you bought an account using real money, you broke TOS.`} 
          />
        </div>
      </section>

      {/* Cards & Scarcity */}
      <section className="space-y-6">
        <div className="flex items-center gap-3 text-emerald-400">
          <Layers size={24} />
          <h3 className="text-2xl font-display font-bold uppercase tracking-widest">Cards & Scarcity</h3>
        </div>
        <div className="bg-navy-800/50 rounded-[32px] border border-white/5 px-8">
          <FAQItem 
            question="What does the print number mean?" 
            answer="That is the number of your card, both the print ID and ID number, if you have 1/100 it means that's the first of that card that will ever be printed, with 100 total existing." 
          />
          <FAQItem 
            question="What happens when all copies of a card are claimed?" 
            answer="They are removed from the pack they come from, and can only be obtained from the marketplace or by trading." 
          />
          <FAQItem 
            question="What are the four rarity tiers and how rare are they?" 
            answer={`Common, Uncommon, Rare, and Legendary\n\n1000 Common cards exist for each common\n100 Uncommon\n10 Rare\n1 Legendary`} 
          />
          <FAQItem 
            question="Does a lower print number make my card more valuable?" 
            answer="Not necessarily, but having a first print is for sure more valuable to some." 
          />
          <FAQItem 
            question="Can the same card ever be reprinted?" 
            answer="Two Pixel Tetos can be printed, but only one 2/10 Pixel Teto can be printed." 
          />
        </div>
      </section>

      {/* Packs & Rotation */}
      <section className="space-y-6">
        <div className="flex items-center gap-3 text-amber-400">
          <RefreshCw size={24} />
          <h3 className="text-2xl font-display font-bold uppercase tracking-widest">Packs & Rotation</h3>
        </div>
        <div className="bg-navy-800/50 rounded-[32px] border border-white/5 px-8">
          <FAQItem 
            question="How long is a pack available before it rotates out?" 
            answer={
              <div className="space-y-6">
                <p>Packs are available for 2 weeks, and rotate on Tuesday and Fridays.</p>
                
                <div className="bg-navy-900/50 rounded-2xl p-6 border border-white/5 space-y-4">
                  <h4 className="text-white font-bold flex items-center gap-2">
                    <Clock size={16} className="text-amber-400" />
                    Rotation Schedule
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-2">
                      <p className="text-slate-500 font-bold uppercase tracking-tighter">Week 1</p>
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                        <span className="text-amber-400 font-bold">Tuesday:</span> Pack A Out, Pack E In
                      </div>
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                        <span className="text-amber-400 font-bold">Friday:</span> Pack B Out, Pack F In
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-slate-500 font-bold uppercase tracking-tighter">Week 2</p>
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                        <span className="text-amber-400 font-bold">Tuesday:</span> Pack C Out, Pack G In
                      </div>
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                        <span className="text-amber-400 font-bold">Friday:</span> Pack D Out, Pack H In
                      </div>
                    </div>
                  </div>
                  <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-center text-indigo-300">
                    <span className="font-bold">Week 3 Tuesday:</span> Pack E Out, Pack A In
                  </div>
                </div>

                <p className="text-sm italic">Packs are not guaranteed to come back every 2 weeks of being gone, but are gone for 2 weeks minimum.</p>
              </div>
            } 
          />
          <FAQItem 
            question="What happens to unclaimed copies when a pack leaves rotation?" 
            answer="They cannot be obtained until the pack comes back into rotation." 
          />
          <FAQItem 
            question="How do I know when a pack is leaving soon?" 
            answer={`Packs have a disclaimer (Group A, B, C, or D), one tuesday Group A gets rotated, then Group B that Friday, next tuesday Group C, that Friday Group D, Tuesday after that Group A rotates again.\n\nThe Calendar shows the dates for group rotations.`} 
          />
          <FAQItem 
            question="How many cards do I get per pack?" 
            answer="You get a single card per pack." 
          />
        </div>
      </section>

      {/* Marketplace */}
      <section className="space-y-6">
        <div className="flex items-center gap-3 text-rose-400">
          <ShoppingBag size={24} />
          <h3 className="text-2xl font-display font-bold uppercase tracking-widest">Marketplace</h3>
        </div>
        <div className="bg-navy-800/50 rounded-[32px] border border-white/5 px-8">
          <FAQItem 
            question="How do I list a card for sale?" 
            answer={`Simply go to your collection, click on the card you want to sell, push List on Marketplace, and set the price.\n\nNote: a 5% fee is taken from incoming tokens to prevent marketplace inflation.`} 
          />
          <FAQItem 
            question="Can I set any price I want?" 
            answer="There are no limits, however, supply and demand - I recommend staying inline with other prices." 
          />
          <FAQItem 
            question="How do I buy a card from another player?" 
            answer="Go to the Market tab, find a card you like, if you can afford it, click Buy." 
          />
          <FAQItem 
            question="What happens if nobody buys my listing?" 
            answer="Nothing - it just sits there, forever." 
          />
          <FAQItem 
            question="Can I cancel a listing after posting it?" 
            answer="Yes! by clicking on the Market tab, then My Listings, and push 'Remove'." 
          />
        </div>
      </section>

      {/* Trading */}
      <section className="space-y-6">
        <div className="flex items-center gap-3 text-blue-400">
          <ArrowLeftRight size={24} />
          <h3 className="text-2xl font-display font-bold uppercase tracking-widest">Trading</h3>
        </div>
        <div className="bg-navy-800/50 rounded-[32px] border border-white/5 px-8">
          <FAQItem 
            question="What is the difference between the Marketplace and Trades?" 
            answer="Marketplace you sell for tokens, Trading you sell for a card of your choice with the person of your choice." 
          />
          <FAQItem 
            question="How do I send a trade offer?" 
            answer="Go to the Trades Tab, Push New Trades Offer, put in the username of the person you want to trade with, and choose the card you want to trade for." 
          />
          <FAQItem 
            question="Can I trade for Chips instead of cards?" 
            answer="You are describing the market, my dear." 
          />
          <FAQItem 
            question="What happens if the other player never responds to my offer?" 
            answer="You can cancel the trade, but nothing really." 
          />
        </div>
      </section>

      {/* Economy */}
      <section className="space-y-6">
        <div className="flex items-center gap-3 text-emerald-400">
          <Coins size={24} />
          <h3 className="text-2xl font-display font-bold uppercase tracking-widest">Economy</h3>
        </div>
        <div className="bg-navy-800/50 rounded-[32px] border border-white/5 px-8">
          <FAQItem 
            question="How much does the daily login reward give?" 
            answer="100 on the first day, 200 on the second, then 300, so on until 500, missing a day resets this." 
          />
          <FAQItem 
            question="What are quests and how do they work?" 
            answer={`You have 3 quests per day, Easy, Medium, and Hard.\nEasy quests award 300 tokens, Medium 500, and Hard 1250 tokens.\nThese can be done 1 a day each.`} 
          />
          <FAQItem 
            question="Do Chips expire?" 
            answer="Nope." 
          />
          <FAQItem 
            question="Is there a limit to how many Chips I can hold?" 
            answer="Now, I want to say no, but technically there's an integer limit, so yes, but thats 2147483647." 
          />
        </div>
      </section>

      {/* Account */}
      <section className="space-y-6">
        <div className="flex items-center gap-3 text-slate-400">
          <User size={24} />
          <h3 className="text-2xl font-display font-bold uppercase tracking-widest">Account</h3>
        </div>
        <div className="bg-navy-800/50 rounded-[32px] border border-white/5 px-8">
          <FAQItem 
            question="Can I have multiple accounts?" 
            answer="This is against the TOS to protect against inflation." 
          />
          <FAQItem 
            question="What happens to my cards if I delete my account?" 
            answer="Oh thats simple, you cant delete your account :)" 
          />
          <FAQItem 
            question="Can I change my username?" 
            answer="Yes! Profile -> settings -> Change Username." 
          />
        </div>
      </section>

      {/* Footer Note */}
      <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-[32px] p-8 flex items-center gap-6">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500 flex items-center justify-center text-white shrink-0">
          <AlertCircle size={32} />
        </div>
        <div className="space-y-1">
          <h4 className="text-xl font-display font-bold text-white">Need more help?</h4>
          <p className="text-indigo-300/70">Vantage is a solo project. If you find bugs or have suggestions, reach out to the developer!</p>
          <p className="text-xs text-indigo-300/40 italic">I don't bite (much)</p>
        </div>
      </div>
    </div>
  );
};
