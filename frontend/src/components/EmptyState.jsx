/**
 * EmptyState component — shown when a list/panel has no data.
 *
 * Props:
 *   - icon: React icon component to display
 *   - title: main heading
 *   - description: secondary text
 *   - action: optional CTA button (React element)
 */
export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center animate-fade-in">
      {Icon && (
        <div className="w-14 h-14 rounded-2xl bg-surface-700 flex items-center justify-center mb-4">
          <Icon className="w-7 h-7 text-gray-500" />
        </div>
      )}
      <h3 className="text-sm font-medium text-gray-300 mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-gray-500 max-w-xs mb-4">{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
