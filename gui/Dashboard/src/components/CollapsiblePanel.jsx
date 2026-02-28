import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * CollapsiblePanel — Unified collapsible component for sidebar-menu sections.
 * 
 * Features:
 * - Unified header using <button> for accessibility.
 * - Local storage state persistence via unique 'id'.
 * - Smooth expand/collapse animations via CSS transitions.
 * - Keyboard accessibility (Space/Enter to toggle, ARIA attributes).
 * - Space-efficient design (max header height 56px, content padding 16px).
 * - Auto-scroll on expand to keep the section title visible.
 * 
 * @param {Object} props
 * @param {string} props.id - Unique identifier for localStorage persistence.
 * @param {string|React.ReactNode} props.title - Panel title or left-side header content.
 * @param {React.ReactNode} props.headerRight - Optional content on the right side of the header.
 * @param {React.ReactNode} props.children - Panel content.
 * @param {boolean} props.defaultOpen - Initial state if no localStorage entry exists.
 * @param {string} props.className - Additional CSS classes for the container.
 * @param {string} props.headerClassName - Additional CSS classes for the header button.
 * @param {string} props.bodyClassName - Additional CSS classes for the body container.
 */
const CollapsiblePanel = ({
  id,
  title,
  headerLeft,
  headerRight,
  children,
  defaultOpen = true,
  isOpen: controlledIsOpen,
  onToggle: controlledOnToggle,
  className = '',
  headerClassName = '',
  bodyClassName = '',
  expandable = false
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(() => {
    if (!id) return defaultOpen;
    const saved = localStorage.getItem(`quflx-panel-${id}`);
    return saved !== null ? JSON.parse(saved) : defaultOpen;
  });

  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  const contentRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!id) return;
    
    const handleStorageChange = () => {
      const saved = localStorage.getItem(`quflx-panel-${id}`);
      if (saved !== null) {
        setInternalIsOpen(JSON.parse(saved));
      }
    };

    const handleExpandAll = () => {
      if (!isControlled) {
        setInternalIsOpen(true);
        localStorage.setItem(`quflx-panel-${id}`, 'true');
      }
    };

    const handleCollapseAll = () => {
      if (!isControlled) {
        setInternalIsOpen(false);
        localStorage.setItem(`quflx-panel-${id}`, 'false');
      }
    };

    const handleGlobalRetract = (e) => {
      if (!id || isControlled) return;
      const { retractedId, expandId } = e.detail || {};
      if (id === retractedId) {
        setInternalIsOpen(false);
        localStorage.setItem(`quflx-panel-${id}`, 'false');
      } else if (id === expandId) {
        setInternalIsOpen(true);
        localStorage.setItem(`quflx-panel-${id}`, 'true');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('quflx-panels-expand-all', handleExpandAll);
    window.addEventListener('quflx-panels-collapse-all', handleCollapseAll);
    window.addEventListener('quflx-panel-global-retract', handleGlobalRetract);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('quflx-panels-expand-all', handleExpandAll);
      window.removeEventListener('quflx-panels-collapse-all', handleCollapseAll);
      window.removeEventListener('quflx-panel-global-retract', handleGlobalRetract);
    };
  }, [id, isControlled]);

  useEffect(() => {
    if (id && !isControlled) {
      localStorage.setItem(`quflx-panel-${id}`, JSON.stringify(isOpen));
    }
  }, [isOpen, id, isControlled]);

  const toggleOpen = () => {
    const nextState = !isOpen;
    if (isControlled) {
      controlledOnToggle?.(nextState);
    } else {
      setInternalIsOpen(nextState);
    }

    // Global behavior: if retracting, expand the panel beneath if it's not retracted
    if (!nextState && id) {
      // Small delay to allow state update or use custom event for coordination
      window.dispatchEvent(new CustomEvent('quflx-panel-retracted', { 
        detail: { id } 
      }));
    }

    // Auto-scroll logic: if opening, scroll into view
    if (nextState) {
      setTimeout(() => {
        containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`flex flex-col border border-border-primary rounded-xl overflow-hidden bg-card-bg transition-all duration-300 ${isOpen && expandable ? 'flex-grow min-h-[120px]' : 'flex-none'} ${className}`}
    >
      {/* Header Button */}
      <button
        type="button"
        onClick={toggleOpen}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            toggleOpen();
          }
        }}
        aria-expanded={isOpen}
        aria-controls={`panel-content-${id}`}
        className={`w-full h-[48px] flex items-center justify-between px-4 text-left hover:bg-white/5 transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-accent-green/30 shrink-0 group/header ${headerClassName}`}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div className={`p-1.5 rounded-lg transition-colors ${isOpen ? 'bg-accent-green/10 text-accent-green' : 'bg-white/5 text-text-secondary group-hover/header:text-text-primary'}`}>
            {headerLeft || (typeof title === 'string' ? (
              <span className="text-[10px] font-bold uppercase tracking-widest truncate">
                {title}
              </span>
            ) : (
              title
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {headerRight && (
            <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
              {headerRight}
            </div>
          )}
          <div className={`transition-transform duration-300 ${isOpen ? 'rotate-180 text-accent-green' : 'text-text-secondary group-hover/header:text-text-primary'}`}>
            <ChevronDown size={14} strokeWidth={2.5} />
          </div>
        </div>
      </button>

      {/* Content Body */}
      <div
        id={`panel-content-${id}`}
        ref={contentRef}
        className={`transition-all duration-300 ease-in-out ${isOpen ? (expandable ? 'flex-1 opacity-100 overflow-y-auto custom-scrollbar' : 'max-h-[2000px] opacity-100 overflow-hidden') : 'max-h-0 opacity-0 pointer-events-none overflow-hidden'}`}
      >
        <div className={`p-4 border-t border-border-primary/30 ${bodyClassName}`}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default CollapsiblePanel;
