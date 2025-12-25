// gui/Dashboard/src/components/ProfileMenu.jsx

import avatar from '../assets/Anime_Girl_Profile.jpg';

const ProfileMenu = () => {
  return (
    <button
      type="button"
      className="flex items-center gap-2 pl-3 pr-4 py-1 rounded-full bg-gray-800 border border-gray-700 hover:bg-gray-700 text-xs text-gray-200"
    >
      <img
        src={avatar}
        alt="Profile"
        className="w-7 h-7 rounded-full object-cover"
      />
      <span className="hidden sm:inline">Profile</span>
    </button>
  );
};

export default ProfileMenu;

