export default function Card({ children, className = '' }) {
  return (
	<div className={`quflx-card bg-card-bg border border-border-primary rounded-2xl p-6 ${className}`}>
      {children}
    </div>
  );
}
