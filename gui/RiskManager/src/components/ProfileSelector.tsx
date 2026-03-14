import { useState, useEffect } from 'react';
import { User, ChevronDown, Plus, Download, X } from 'lucide-react';
import { Profile } from '../lib/calendar-utils';
import { storage } from '../lib/storage';

interface ProfileSelectorProps {
  onProfileChanged?: () => void;
}

export default function ProfileSelector({ onProfileChanged }: ProfileSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | undefined>();
  const [newProfileName, setNewProfileName] = useState('');

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = () => {
    const allProfiles = storage.getProfiles();
    setProfiles(allProfiles);
    const active = storage.getActiveProfile();
    setActiveProfile(active ?? undefined);
  };

  const handleSwitch = (id: string) => {
    storage.setActiveProfileId(id);
    loadProfiles();
    setIsOpen(false);
    if (onProfileChanged) onProfileChanged();
  };

  const handleCreate = () => {
    if (!newProfileName.trim()) return;
    
    const newProfile: Profile = {
      id: Math.random().toString(36).substr(2, 9),
      name: newProfileName,
      initial_balance: 1000,
      payout_percentage: 80,
      risk_per_trade: 1,
      use_fixed_amount: false,
      fixed_risk_amount: 10,
      created_at: new Date().toISOString()
    };

    storage.saveProfile(newProfile);
    setNewProfileName('');
    setShowNewModal(false);
    handleSwitch(newProfile.id);
  };

  const handleExport = (profile: Profile) => {
    const data = storage.getFullProfileData(profile.id);
    if (!data) return;
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${profile.name.replace(/\s+/g, '_')}_data.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-4 py-2 bg-[#1a1f2e] border border-gray-800 rounded-xl hover:border-gray-700 transition-all text-left"
      >
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
          <User className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-[120px]">
          <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Active Persona</div>
          <div className="text-sm font-bold text-white truncate">{activeProfile?.name}</div>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full mt-2 left-0 w-64 bg-[#1a1f2e] border border-gray-800 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
            <div className="p-2 border-b border-gray-800">
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-3 py-2">Switch Account</div>
              <div className="space-y-1">
                {profiles.map(p => (
                  <div
                    key={p.id}
                    className={`group w-full flex items-center gap-2 rounded-lg transition-colors ${
                      p.id === activeProfile?.id
                        ? 'bg-blue-500/10 text-blue-400'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    <button
                      onClick={() => handleSwitch(p.id)}
                      className="flex-1 text-left px-3 py-2 font-semibold text-sm"
                    >
                      {p.name}
                    </button>
                    <button
                      onClick={() => handleExport(p)}
                      className="p-1 mr-2 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Export Data"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            
            <button
              onClick={() => { setShowNewModal(true); setIsOpen(false); }}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm font-bold text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create New Persona
            </button>
          </div>
        </>
      )}

      {showNewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-[#1a1f2e] border border-gray-800 rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                  <Plus className="w-6 h-6 text-emerald-500" />
                </div>
                New Persona
              </h3>
              <button onClick={() => setShowNewModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Persona Name</label>
                <input
                  type="text"
                  autoFocus
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  className="w-full bg-[#0f1419] border border-gray-800 rounded-2xl px-6 py-4 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-semibold"
                  placeholder="e.g. My Challenge Account"
                />
              </div>

              <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl">
                <p className="text-sm text-gray-400 leading-relaxed">
                  Creating a new persona will give you a fresh dashboard and calendar. Your existing stats will be kept safe under your current persona.
                </p>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => setShowNewModal(false)}
                  className="flex-1 py-4 px-6 bg-[#0f1419] border border-gray-800 rounded-2xl text-white font-bold hover:bg-gray-800 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newProfileName.trim()}
                  className="flex-1 py-4 px-6 bg-emerald-500 rounded-2xl text-white font-bold hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/20"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
