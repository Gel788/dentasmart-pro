import clsx from 'clsx';
import { patientInitials } from '@/lib/patient';

const sizes = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-16 w-16 text-lg',
  xl: 'h-20 w-20 text-2xl',
};

export function PatientAvatar({
  firstName,
  lastName,
  size = 'md',
  className,
}: {
  firstName: string;
  lastName: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'flex shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] font-medium text-white',
        sizes[size],
        className,
      )}
      aria-hidden
    >
      {patientInitials(firstName, lastName)}
    </div>
  );
}
