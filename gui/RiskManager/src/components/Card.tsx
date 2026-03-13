import { ReactNode } from 'react';
import { Settings, RefreshCw } from 'lucide-react';

interface CardProps {
  title?: string;
  children: ReactNode;
  actions?: boolean;
  className?: string;
}

export default function Card({ title, children, actions = false, className = '' }: CardProps) {
  return (
    <div className={`bg-[#1a1f2e] border border-gray-800 rounded-2xl overflow-hidden ${className}`}>
      {title && (
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">{title}</h2>
          {actions && (
            <div className="flex items-center gap-2">
              <button className="text-gray-400 hover:text-emerald-400 transition-colors p-1">
                <Settings className="w-5 h-5" />
              </button>
              <button className="text-gray-400 hover:text-emerald-400 transition-colors p-1">
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      )}
      <div className="p-6">
        {children}
      </div>
    </div>
  );
}
