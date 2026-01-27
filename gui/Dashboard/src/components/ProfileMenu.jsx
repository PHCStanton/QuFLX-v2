import { useEffect, useState } from 'react';
import avatarPlaceholder from '../assets/profile_pic_new.png';
import useMarketStore from '../store/marketStore';
import useUserStore from '../store/userStore';
import ProfilePicEditorModal from './ProfilePicEditorModal';

const ProfileMenu = () => {
  const [open, setOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const { setActiveTab } = useMarketStore();
  const { user } = useUserStore();

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
