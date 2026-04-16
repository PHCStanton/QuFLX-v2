  <rect x="32" y="86" width="6" height="10" rx="2" fill="currentColor" opacity="0.4" />
    <rect x="47" y="86" width="6" height="12" rx="2" fill="currentColor" opacity="0.6" />
    <rect x="62" y="86" width="6" height="10" rx="2" fill="currentColor" opacity="0.4" />

    <rect x="4" y="32" width="10" height="6" rx="2" fill="currentColor" opacity="0.4" />
    <rect x="2" y="47" width="12" height="6" rx="2" fill="currentColor" opacity="0.6" />
    <rect x="4" y="62" width="10" height="6" rx="2" fill="currentColor" opacity="0.4" />

    <rect x="86" y="32" width="10" height="6" rx="2" fill="currentColor" opacity="0.4" />
    <rect x="86" y="47" width="12" height="6" rx="2" fill="currentColor" opacity="0.6" />
    <rect x="86" y="62" width="10" height="6" rx="2" fill="currentColor" opacity="0.4" />

    <rect x="12" y="12" width="76" height="76" rx="10" fill="url(#askAiModalChipGradient)" stroke="currentColor" strokeWidth="1.5" />
    <rect x="20" y="20" width="60" height="60" rx="6" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.2" />

    <text
      x="50"
      y="52"
      fontFamily="system-ui, sans-serif"
      fontSize="50"
      fontWeight="900"
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="central"
      style={{ letterSpacing: '-0.02em' }}
    >
      AI
    </text>
  </svg>
);

const OptionCard = ({ title, description, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`text-left rounded-xl border p-4 transition-colors bg-[#0f1419] ${active ? 'border-purple-500/70 ring-1 ring-purple-500/40' : 'border-gray-800 hover:border-gray-700'}`}
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        