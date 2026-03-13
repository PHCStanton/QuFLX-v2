/**
 * ChartContextMenu — scalable right-click context menu for the chart workspace.
 *
 * Architecture:
 *  - Items are plain objects: { id, label, icon, group, disabled, divider, onClick }
 *  - `group` is a free-form tag (e.g. 'global', 'sr', 'drawing') for future grouping
 *  - `disabled` items render greyed-out with a tooltip explaining why
 *  - Dividers (items with `divider: true`) render a horizontal rule
 *  - Adding new tools later = just push another item object into the items array
 *    in ChartWorkspace — no changes needed here
 */
import { useEffect, useRef } from 'react';

const ChartContextMenu = ({ visible, x, y, items, onClose }) => {
    const menuRef = useRef(null);

    // Close on outside click or Escape
    useEffect(() => {
        if (!visible) return;

        const handleClick = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
        };
        const handleKey = (e) => {
            if (e.key === 'Escape') onClose();
        };

        document.addEventListener('mousedown', handleClick);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('keydown', handleKey);
        };
    }, [visible, onClose]);

    if (!visible) return null;

    // Keep menu inside viewport
    const menuWidth = 220;
    const menuHeight = items.length * 32 + 12;
    const safeX = Math.min(x, window.innerWidth - menuWidth - 8);
    const safeY = Math.min(y, window.innerHeight - menuHeight - 8);

    return (
        <div
            ref={menuRef}
            className="fixed z-[9999] select-none"
            style={{ left: safeX, top: safeY }}
        >
            <div
                className="min-w-[200px] rounded-lg border border-gray-700 bg-gray-900/95 backdrop-blur-md shadow-2xl py-1.5 overflow-hidden"
                style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
            >
                {items.map((item, idx) => {
                    if (item.divider) {
                        return <div key={`divider-${idx}`} className="my-1 border-t border-gray-700/60" />;
                    }

                    return (
                        <button
                            key={item.id}
                            type="button"
                            disabled={item.disabled}
                            title={item.disabledReason || undefined}
                            onClick={() => {
                                if (item.disabled) return;
                                item.onClick?.();
                                onClose();
                            }}
                            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-left transition-colors
                ${item.disabled
                                    ? 'text-gray-600 cursor-not-allowed'
                                    : 'text-gray-200 hover:bg-gray-700/60 hover:text-white cursor-pointer'
                                }`}
                        >
                            {item.icon && (
                                <span className={`text-[13px] ${item.disabled ? 'opacity-40' : ''}`}>
                                    {item.icon}
                                </span>
                            )}
                            <span className={item.disabled ? 'opacity-40' : ''}>{item.label}</span>
                            {item.disabled && item.disabledReason && (
                                <span className="ml-auto text-[9px] text-gray-600 italic truncate max-w-[80px]">
                                    {item.disabledReason}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default ChartContextMenu;
