// gui/Dashboard/src/components/ProfileMenu.jsx
import { useEffect, useState } from 'react';
import avatar from '../assets/Anime_Girl_Profile.jpg';

const ProfileMenu = () => {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState('default');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'orange-dark') {
      root.classList.add('theme-orange-dark');
    } else {
      root.classList.remove('theme-orange-dark');
    }
  }, [theme]);

  const handleToggle = () => {
    setOpen((prev) => !prev);
  };

  const handleThemeChange = (value) => {
    setTheme(value);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-2 pl-3 pr-4 py-1 rounded-full bg-gray-800 border border-gray-700 hover:bg-gray-700 text-xs text-gray-200"
      >
        <img
          src={avatar}
          alt="Profile"
          className="w-7 h-7 rounded-full object-cover"
        />
        <span className="hidden sm:inline">Profile</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-card-bg border border-gray-700 rounded-lg shadow-lg text-xs text-gray-200 z-50">
          <div className="px-3 py-2 border-b border-gray-700">
            <div className="font-semibold">Account</div>
          </div>
          <button
            type="button"
            className="w-full text-left px-3 py-2 hover:bg-gray-800"
          >
            Profile
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-2 hover:bg-gray-800"
          >
            Account Settings
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-2 hover:bg-gray-800"
          >
            Trading Preferences
          </button>
          <div className="px-3 py-2 border-t border-gray-700 text-[11px] font-semibold text-text-secondary">
            Themes
          </div>
          <button
            type="button"
            onClick={() => handleThemeChange('default')}
            className={`w-full text-left px-3 py-2 text-[11px] ${
              theme === 'default'
                ? 'bg-accent-green/10 text-accent-green'
                : 'hover:bg-gray-800'
            }`}
          >
            Default
          </button>
          <button
            type="button"
            onClick={() => handleThemeChange('orange-dark')}
            className={`w-full text-left px-3 py-2 text-[11px] ${
              theme === 'orange-dark'
                ? 'bg-orange-500/10 text-orange-400'
                : 'hover:bg-gray-800'
            }`}
          >
            Orange Dark
          </button>
          <div className="px-3 py-2 border-t border-gray-700">
            <button
              type="button"
              className="w-full text-left px-1 py-1 text-[11px] text-red-400 hover:bg-gray-800"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileMenu;
