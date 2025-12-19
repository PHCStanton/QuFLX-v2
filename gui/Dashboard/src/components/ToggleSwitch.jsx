const ToggleSwitch = ({ checked, onChange }) => (
  <div 
    onClick={onChange}
    className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${checked ? 'bg-accent-green' : 'bg-gray-700'}`}
  >
    <div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-all ${checked ? 'left-6' : 'left-1'}`}></div>
  </div>
);

export default ToggleSwitch;
