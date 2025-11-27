import React from 'react';

export default function Card({ children, className = '' }) {
  return (
    <div className={`bg-card-bg border border-gray-800 rounded-2xl p-6 ${className}`}>
      {children}
    </div>
  );
}
