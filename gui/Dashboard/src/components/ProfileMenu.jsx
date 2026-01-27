// gui/Dashboard/src/components/ProfileMenu.jsx
import { useEffect, useState } from 'react';
import avatar from '../assets/profile_pic_new.png';

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
        className="flex items-center gap-2 pl-3 pr-4 py-1 rounded-full bg-section-bg border border-border-primary hover:bg-section-bg/80 text-xs text-text-primary"
      >
        <img
          src={avatar}
          alt="Profile"
          className="w-7 h-7 rounded-full object-cover"
        />
        <span className="hidden sm:inline">Profile</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-card-bg border border-border-primary rounded-lg shadow-lg text-xs text-text-primary z-50">
          <div className="px-3 py-2 border-b border-border-primary">
            <div className="font-semibold">Account</div>
          </div>
          <button
            type="button"
            className="w-full text-left px-3 py-2 hover:bg-section-bg"
          >
            Profile
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-2 hover:bg-section-bg"
          >
            Account Settings
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-2 hover:bg-section-bg"
          >
            Trading Preferences
          </button>
          <div className="px-3 py-2 border-t border-border-primary text-[11px] font-semibold text-text-secondary">
            Themes
          </div>
          <button
            type="button"
            onClick={() => handleThemeChange('default')}
            className={`w-full text-left px-3 py-2 text-[11px] ${theme === 'default'
                ? 'bg-accent-green/10 text-accent-green'
                : 'hover:bg-section-bg'
              }`}
          >
            Default
          </button>
          <button
            type="button"
            onClick={() => handleThemeChange('orange-dark')}
            className={`w-full text-left px-3 py-2 text-[11px] ${theme === 'orange-dark'
                ? 'bg-accent-green/10 text-accent-green'
                : 'hover:bg-section-bg'
              }`}
          >
            Orange Dark
          </button>
          <div className="px-3 py-2 border-t border-border-primary">
            <button
              type="button"
              className="w-full text-left px-1 py-1 text-[11px] text-red-400 hover:bg-section-bg"
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
