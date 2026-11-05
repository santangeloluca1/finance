import type { Slice } from "@/lib/analytics";

/**
 * Allocazione a semicerchio segmentato (ispirata a getquin):
 * ogni segmento è una fetta, con piccoli spazi tra le fette.
 */
export function Gauge({ slices, children, size = 280 }: { slices: Slice[]; children?: React.ReactNode; size?: number }) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const stroke = 24;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const len = Math.PI * r;
  const gap = slices.length > 1 ? 4 : 0;
  let offset = 0;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size / 2 + 12 }}>
      <svg width={size} height={size / 2 + stroke / 2} viewBox={`0 0 ${size} ${size / 2 + stroke / 2}`}>
        <path d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`} fill="none" stroke="var(--chip)" strokeWidth={stroke} />
        {slices.map((s) => {
          const l = (s.value / total) * len;
          const el = (
            <path
              key={s.key}
              d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${Math.max(0.5, l - gap)} ${len * 2}`}
              strokeDashoffset={-offset}
            />
          );
          offset += l;
          return el;
        })}
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">{children}</div>
    </div>
  );
}
