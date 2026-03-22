/**
 * Empty state display for various contexts.
 */

import { cn } from '@renderer/lib/utils';

type EmptyStateProps = {
  icon?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-8 text-center',
        className,
      )}
    >
      {icon && (
        <span className="text-4xl mb-4" aria-hidden="true">
          {icon}
        </span>
      )}
      <h3 className="text-lg font-medium text-sand-text mb-2">{title}</h3>
      <p className="text-sm text-sand-secondary max-w-sm">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
