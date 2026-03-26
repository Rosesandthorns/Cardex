import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Cpu, Copy, Check, Terminal, Shield, Zap, ExternalLink, Info, User } from 'lucide-react';
import { UserProfile } from '../types';

interface AIBridgeProps {
  user: UserProfile;
}

export const AIBridge: React.FC<AIBridgeProps> = ({ user }) => {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const bridgeInfo = [
    {
      label: 'Your AI Player UID',
      value: user.uid,
      id: 'uid',
      icon: User,
      description: 'Use this UID in your Azure application to identify your AI player.'
    },
    {
      label: 'API Endpoint',
      value: `${window.location.origin}/api`,
      id: 'api',
      icon: Terminal,
      description: 'The base URL for all AI Bridge API requests.'
    },
    {
      label: 'Firestore Database ID',
      value: 'ai-studio-4598671a-0e91-47eb-b244-4802dbf0ff68',
      id: 'dbid',
      icon: Shield,
      description: 'The specific Firestore database ID for direct connections.'
    }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-10">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
          <Cpu size={32} />
        </div>
        <div>
          <h2 className="text-4xl font-display font-bold text-white tracking-tight">AI Bridge</h2>
          <p className="text-slate-400 font-medium">Connect your external AI players to the Vantage ecosystem.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-navy-800/50 rounded-[32px] p-8 border border-white/5 space-y-6">
            <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
              <Zap size={20} className="text-amber-400" />
              Connection Details
            </h3>
            
            <div className="space-y-4">
              {bridgeInfo.map((info) => (
                <div key={info.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">{info.label}</label>
                    {copied === info.id ? (
                      <span className="text-xs text-emerald-400 flex items-center gap-1">
                        <Check size={12} /> Copied
                      </span>
                    ) : (
                      <button 
                        onClick={() => handleCopy(info.value, info.id)}
                        className="text-slate-500 hover:text-white transition-colors"
                      >
                        <Copy size={14} />
                      </button>
                    )}
                  </div>
                  <div className="bg-black/40 rounded-xl p-3 font-mono text-sm text-indigo-300 border border-white/5 break-all">
                    {info.value}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">{info.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-indigo-500/5 rounded-[32px] p-8 border border-indigo-500/10 space-y-4">
            <h3 className="text-lg font-display font-bold text-white flex items-center gap-2">
              <Info size={18} className="text-indigo-400" />
              Quick Start
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              To connect your AI from Azure, use the Firebase Admin SDK with your service account key. 
              Ensure you target the specific database ID provided above.
            </p>
            <div className="flex gap-4">
              <a 
                href="https://firebase.google.com/docs/admin/setup" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                Admin SDK Docs <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-navy-800/50 rounded-[32px] p-8 border border-white/5 space-y-6">
            <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
              <Terminal size={20} className="text-emerald-400" />
              Python Integration
            </h3>
            
            <div className="space-y-4">
              <p className="text-sm text-slate-400">Initialize your connection with this snippet:</p>
              <div className="bg-black/60 rounded-2xl p-6 font-mono text-xs text-slate-300 border border-white/5 overflow-x-auto">
                <pre>{`import firebase_admin
from firebase_admin import credentials, firestore

# Initialize with service account
cred = credentials.Certificate('service-account.json')
firebase_admin.initialize_app(cred)

# Connect to specific database
db = firestore.client(
    database_id='ai-studio-4598671a-0e91-47eb-b244-4802dbf0ff68'
)

# Your AI UID:
AI_UID = "${user.uid}"`}</pre>
              </div>
              <p className="text-xs text-slate-500 italic">
                * Ensure 'service-account.json' is present in your Azure environment.
              </p>
            </div>
          </div>

          <div className="bg-amber-500/5 rounded-[32px] p-8 border border-amber-500/10 space-y-4">
            <h3 className="text-lg font-display font-bold text-white flex items-center gap-2">
              <Shield size={18} className="text-amber-400" />
              Security Note
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              The AI Bridge bypasses standard browser security layers. Never share your 
              <code className="text-amber-300 px-1">x-ai-api-key</code> or service account keys.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
