const ToggleSwitch = ({ checked, onChange }) => (
  <button
    type="button"
    onClick={onChange}
    className={`w-9 h-5 flex items-center rounded-full border transition-colors focus:outline-none ${
      checked ? 'bg-accent-green border-accent-green' : 'bg-section-bg border-border-primary'
    }`}
  >
    <span
      className={`w-4 h-4 bg-text-primary rounded-full transform transition-transform ${
        checked ? 'translate-x-4' : 'translate-x-1'
      }`}
    />
  </button>
);

export default ToggleSwitch;
