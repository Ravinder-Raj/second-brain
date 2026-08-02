export function Spinner({ size = 'md', className = '' }) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-3',
  }[size] || 'w-6 h-6 border-2';

  return (
    <div
      className={`${sizeClasses} border-surface-500 border-t-brand-500 rounded-full animate-spin ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

export function Skeleton({ lines = 3, className = '' }) {
  return (
    <div className={`space-y-2 animate-pulse ${className}`}>
      {Array.from({ length: lines }).map((_, idx) => (
        <div
          key={idx}
          className="h-3 rounded-lg bg-surface-700/60"
          style={{ width: `${100 - (idx % 3) * 15}%` }}
        />
      ))}
    </div>
  );
}

export default function Loader({ size = 'md', className = '' }) {
  return (
    <div className={`flex items-center justify-center py-6 ${className}`}>
      <Spinner size={size} />
    </div>
  );
}
