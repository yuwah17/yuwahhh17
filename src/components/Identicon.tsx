import React from 'react';
import { createIdenticonSeed } from '../lib/crypto';

interface IdenticonProps {
  fingerprint: string;
  size?: number;
  className?: string;
}

export const Identicon: React.FC<IdenticonProps> = ({
  fingerprint,
  size = 32,
  className = '',
}) => {
  const cells = createIdenticonSeed(fingerprint);
  const clean = fingerprint.replace(/\s+/g, '');
  const hue = (clean.charCodeAt(0) * 19 + clean.charCodeAt(1) * 7) % 360;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      aria-hidden="true"
      className={`shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 ${className}`}
    >
      {cells.map((active, idx) => {
        if (!active) return null;
        const row = Math.floor(idx / 3);
        const col = idx % 3;
        return (
          <rect
            key={idx}
            x={6 + col * 8}
            y={6 + row * 8}
            width={7}
            height={7}
            rx={1.5}
            fill={`hsl(${hue}, 58%, 46%)`}
          />
        );
      })}
    </svg>
  );
};
