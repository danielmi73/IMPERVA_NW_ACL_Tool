import React from 'react';

interface Props {
  isUnderAttack: boolean;
  since?: string | null;
}

export default function AttackBadge({ isUnderAttack, since }: Props) {
  if (isUnderAttack) {
    const duration = since ? getAttackDuration(since) : '';
    return (
      <span className="badge badge-danger">
        <span className="status-dot attack" />
        Under Attack {duration && `(${duration})`}
      </span>
    );
  }
  return (
    <span className="badge badge-success">
      <span className="status-dot online" />
      Normal
    </span>
  );
}

function getAttackDuration(since: string): string {
  try {
    const start = new Date(since).getTime();
    const now = Date.now();
    const diff = Math.max(0, now - start);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return '<1m';
  } catch {
    return '';
  }
}
