import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export const CollapsibleCard = ({
  headerLeft,
  headerRight,
  children,
  defaultOpen = true,
  isOpen: controlledIsOpen,
  onToggle: controlledOnToggle,
  className = '',
  headerClassName = '',
  bodyClassName = ''
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(defaultOpen);

  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;
  const toggleOpen = isControlled ? controlledOnToggle : () => setInternalIsOpen((prev) => !prev);

  return (
    <div className={`quflx-card bg-card-bg border border-border-primary rounded-2xl p-6 ${className}`}>
      <div
        className={`flex items-center justify-between cursor-pointer ${headerClassName}`}
        role="button"
        tabIndex={0}
        onClick={toggleOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleOpen();
          }
        }}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">{headerLeft}</div>
        <div className="flex items-center gap-2">
          {headerRight}
          {isOpen ? <ChevronUp size={14} className="text-text-secondary" /> : <ChevronDown size={14} className="text-text-secondary" />}
        </div>
      </div>
      {isOpen && <div className={bodyClassName}>{children}</div>}
    </div>
  );
};

export default function Card({ children, className = '' }) {
  return (
    <div className={`quflx-card bg-card-bg border border-border-primary rounded-2xl p-6 ${className}`}>
      {children}
    </div>
  );
}
