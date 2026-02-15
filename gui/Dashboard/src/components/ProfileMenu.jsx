import { useEffect, useState } from 'react';
import avatarPlaceholder from '../assets/profile_pic_new.png';
import useMarketStore from '../store/marketStore';
import useUserStore from '../store/userStore';
import useProfileStore from '../store/profileStore';
import ProfilePicEditorModal from './ProfilePicEditorModal';

const ProfileMenu = () => {
  const [open, setOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const { setActiveTab } = useMarketStore();
  const { user } = useUserStore();
  const {
    profiles,
    activeProfileId,
    isLoading,
    error,
    loadProfiles,
    loadActiveProfile,
    setActiveProfile,
    createProfile,
    deleteProfile,
    ensureSettingsSync
  } = useProfileStore();

  useEffect(() => {
    ensureSettingsSync();
    loadProfiles();
    loadActiveProfile();
  }, [ensureSettingsSync, loadProfiles, loadActiveProfile]);

  const handleToggle = () => {
    setOpen((prev) => !prev);
  };

  const handleProfileClick = () => {
    setEditorOpen(true);
    setOpen(false);
  };

  const handleSettingsClick = () => {
    setActiveTab('settings');
    setOpen(false);
  };

  const handleCreateProfile = async () => {
    const name = window.prompt('Profile name');
    if (!name) return;
    const created = await createProfile(name);
    if (created?.id) {
      await setActiveProfile(created.id);
      setOpen(true);
    }
  };

  const handleDeleteActiveProfile = async () => {
    if (!activeProfileId) return;
    const activeProfile = profiles.find((profile) => profile.id === activeProfileId);
    const label = activeProfile?.name || activeProfileId;
    const ok = window.confirm(`Delete profile "${label}"?`);
    if (!ok) return;
    await deleteProfile(activeProfileId);
  };

  const handleSignOut = () => {
    // Basic sign out logic - could involve clearing stores or redirecting
    if (window.confirm('Are you sure you want to sign out?')) {
      window.localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-2 pl-3 pr-4 py-1 rounded-full bg-section-bg border border-border-primary hover:bg-section-bg/80 text-xs text-text-primary"
      >
        <img
          src={user?.avatar || avatarPlaceholder}
          alt="Profile"
          className="w-7 h-7 rounded-full object-cover"
        />
        <span className="hidden sm:inline">{user?.name || 'Profile'}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-card-bg border border-border-primary rounded-lg shadow-lg text-xs text-text-primary z-50">
          <div className="px-3 py-2 border-b border-border-primary">
            <div className="font-semibold">Account</div>
          </div>
          <button
            type="button"
            onClick={handleProfileClick}
            className="w-full text-left px-3 py-2 hover:bg-section-bg"
          >
            Profile
          </button>
          <button
            type="button"
            onClick={handleSettingsClick}
            className="w-full text-left px-3 py-2 hover:bg-section-bg"
          >
            Account Settings
          </button>
          <button
            type="button"
            onClick={handleSettingsClick}
            className="w-full text-left px-3 py-2 hover:bg-section-bg"
          >
            Trading Preferences
          </button>
          <div className="px-3 py-2 border-t border-border-primary">
            <div className="font-semibold">Profiles</div>
          </div>
          <div className="px-2 pb-2">
            {isLoading && (
              <div className="px-2 py-2 text-[11px] text-text-secondary">Loading profiles...</div>
            )}
            {!isLoading && error && (
              <div className="px-2 py-2 text-[11px] text-red-400">{error}</div>
            )}
            {!isLoading && !error && profiles.length === 0 && (
              <div className="px-2 py-2 text-[11px] text-text-secondary">No profiles found</div>
            )}
            {!isLoading && !error && profiles.length > 0 && (
              <div className="flex flex-col gap-1">
                {profiles.map((profile) => {
                  const isActive = profile.id === activeProfileId;
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => setActiveProfile(profile.id)}
                      className={`w-full text-left px-2 py-1 rounded ${isActive ? 'bg-section-bg/70 text-text-primary' : 'hover:bg-section-bg/50'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium">{profile.name}</span>
                        {isActive && <span className="text-[10px] text-accent-blue">Active</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={handleCreateProfile}
                className="flex-1 px-2 py-1 rounded bg-section-bg hover:bg-section-bg/70 text-[11px] text-text-primary"
              >
                New Profile
              </button>
              <button
                type="button"
                onClick={handleDeleteActiveProfile}
                disabled={!activeProfileId || isLoading}
                className="flex-1 px-2 py-1 rounded border border-red-500/40 text-[11px] text-red-400 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete Active
              </button>
            </div>
          </div>
          <div className="px-3 py-2 border-t border-border-primary">
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full text-left px-1 py-1 text-[11px] text-red-400 hover:bg-section-bg"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}

      <ProfilePicEditorModal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
      />
    </div>
  );
};

export default ProfileMenu;
