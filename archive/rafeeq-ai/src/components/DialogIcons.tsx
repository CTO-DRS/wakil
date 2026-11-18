// Copyright (c) 2026 DRS AI. All rights reserved.
import type { ReactNode } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * Stroke icon set for the themed dialog rows (and a few shared glyphs). Every
 * entry is a plain render function `(color, size?) => ReactNode` rather than a
 * React component, so the dialog host can pass its tone-resolved color while
 * call sites stay theme-free — `icon: dialogIcons.pin` is the whole call-site
 * contract. All glyphs are direction-neutral and read the same in RTL.
 */
export type DialogGlyph = (color: string, size?: number) => ReactNode;

const stroke = (color: string) => ({
  stroke: color,
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
});

const svg = (size: number, children: ReactNode) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    {children}
  </Svg>
);

export const dialogIcons = {
  pin: (color: string, size = 18) =>
    svg(
      size,
      <>
        <Path d="M12 17v5" {...stroke(color)} />
        <Path
          d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"
          {...stroke(color)}
        />
      </>,
    ),

  unpin: (color: string, size = 18) =>
    svg(
      size,
      <>
        <Path d="M12 17v5" {...stroke(color)} />
        <Path
          d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"
          {...stroke(color)}
        />
        <Path d="M4 4l16 16" {...stroke(color)} />
      </>,
    ),

  archive: (color: string, size = 18) =>
    svg(
      size,
      <>
        <Rect x={3} y={4} width={18} height={4.5} rx={1.5} {...stroke(color)} />
        <Path d="M5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8.5" {...stroke(color)} />
        <Path d="M10 12.5h4" {...stroke(color)} />
      </>,
    ),

  unarchive: (color: string, size = 18) =>
    svg(
      size,
      <>
        <Rect x={3} y={4} width={18} height={4.5} rx={1.5} {...stroke(color)} />
        <Path d="M5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8.5" {...stroke(color)} />
        <Path d="M12 17.5v-5" {...stroke(color)} />
        <Path d="M9.5 14.5L12 12l2.5 2.5" {...stroke(color)} />
      </>,
    ),

  pencil: (color: string, size = 18) =>
    svg(
      size,
      <>
        <Path d="M17 3.5a2.6 2.6 0 0 1 3.7 3.7L7.5 20.4 2.5 21.5l1.1-5z" {...stroke(color)} />
        <Path d="M14.5 6l3.5 3.5" {...stroke(color)} />
      </>,
    ),

  sparkles: (color: string, size = 18) =>
    svg(
      size,
      <>
        <Path d="M10 4.5l1.6 4.4 4.4 1.6-4.4 1.6L10 16.5l-1.6-4.4L4 10.5l4.4-1.6z" {...stroke(color)} />
        <Path d="M18.5 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" {...stroke(color)} />
      </>,
    ),

  folder: (color: string, size = 18) =>
    svg(
      size,
      <Path
        d="M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"
        {...stroke(color)}
      />,
    ),

  bell: (color: string, size = 18) =>
    svg(
      size,
      <>
        <Path d="M18 9a6 6 0 0 0-12 0c0 6.5-2.5 8-2.5 8h17S18 15.5 18 9" {...stroke(color)} />
        <Path d="M10.3 20.5a2 2 0 0 0 3.4 0" {...stroke(color)} />
      </>,
    ),

  bellOff: (color: string, size = 18) =>
    svg(
      size,
      <>
        <Path d="M8.2 5.6A6 6 0 0 1 18 9c0 6.5 2.5 8 2.5 8H7" {...stroke(color)} />
        <Path d="M6 9c0 6.5-2.5 8-2.5 8h1.3" {...stroke(color)} />
        <Path d="M10.3 20.5a2 2 0 0 0 3.4 0" {...stroke(color)} />
        <Path d="M4 4l16 16" {...stroke(color)} />
      </>,
    ),

  clock: (color: string, size = 18) =>
    svg(
      size,
      <>
        <Circle cx={12} cy={12} r={8.5} {...stroke(color)} />
        <Path d="M12 7.5V12l3 2" {...stroke(color)} />
      </>,
    ),

  sunrise: (color: string, size = 18) =>
    svg(
      size,
      <>
        <Path d="M7.5 15a4.5 4.5 0 0 1 9 0" {...stroke(color)} />
        <Path d="M3 18.5h18" {...stroke(color)} />
        <Path d="M12 3.5v6" {...stroke(color)} />
        <Path d="M9.5 7L12 4.5 14.5 7" {...stroke(color)} />
      </>,
    ),

  calendar: (color: string, size = 18) =>
    svg(
      size,
      <>
        <Rect x={3.5} y={5} width={17} height={15.5} rx={2} {...stroke(color)} />
        <Path d="M3.5 9.5h17" {...stroke(color)} />
        <Path d="M8 3v4M16 3v4" {...stroke(color)} />
      </>,
    ),

  trash: (color: string, size = 18) =>
    svg(
      size,
      <>
        <Path d="M3.5 6.5h17" {...stroke(color)} />
        <Path d="M18.5 6.5V19a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V6.5" {...stroke(color)} />
        <Path d="M8.5 6.5v-2a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v2" {...stroke(color)} />
        <Path d="M10 11v6M14 11v6" {...stroke(color)} />
      </>,
    ),

  restore: (color: string, size = 18) =>
    svg(
      size,
      <>
        <Path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5" {...stroke(color)} />
        <Path d="M3.5 3.5v5h5" {...stroke(color)} />
      </>,
    ),

  quote: (color: string, size = 18) =>
    svg(
      size,
      <>
        <Path d="M6 5.5h4v5a3.5 3.5 0 0 1-3.5 3.5H6z" {...stroke(color)} />
        <Path d="M14 5.5h4v5a3.5 3.5 0 0 1-3.5 3.5H14z" {...stroke(color)} />
      </>,
    ),

  copy: (color: string, size = 18) =>
    svg(
      size,
      <>
        <Rect x={9} y={9} width={11.5} height={11.5} rx={2} {...stroke(color)} />
        <Path d="M5.5 14.5h-1a1.5 1.5 0 0 1-1.5-1.5V4.5A1.5 1.5 0 0 1 4.5 3H13a1.5 1.5 0 0 1 1.5 1.5v1" {...stroke(color)} />
      </>,
    ),

  share: (color: string, size = 18) =>
    svg(
      size,
      <>
        <Circle cx={18} cy={5.5} r={2.5} {...stroke(color)} />
        <Circle cx={6} cy={12} r={2.5} {...stroke(color)} />
        <Circle cx={18} cy={18.5} r={2.5} {...stroke(color)} />
        <Path d="M8.3 10.8l7.4-4.1M8.3 13.2l7.4 4.1" {...stroke(color)} />
      </>,
    ),

  speaker: (color: string, size = 18) =>
    svg(
      size,
      <>
        <Path d="M11.5 4.5L7 8.5H3.5v7H7l4.5 4z" {...stroke(color)} />
        <Path d="M15 8.8a4.6 4.6 0 0 1 0 6.4M17.8 6.2a8.4 8.4 0 0 1 0 11.6" {...stroke(color)} />
      </>,
    ),

  fileText: (color: string, size = 18) =>
    svg(
      size,
      <>
        <Path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" {...stroke(color)} />
        <Path d="M14 3v5h5" {...stroke(color)} />
        <Path d="M9 13h6M9 17h6" {...stroke(color)} />
      </>,
    ),

  fileDown: (color: string, size = 18) =>
    svg(
      size,
      <>
        <Path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" {...stroke(color)} />
        <Path d="M14 3v5h5" {...stroke(color)} />
        <Path d="M12 11v6" {...stroke(color)} />
        <Path d="M9.5 14.5L12 17l2.5-2.5" {...stroke(color)} />
      </>,
    ),

  download: (color: string, size = 18) =>
    svg(
      size,
      <>
        <Path d="M12 3.5v11" {...stroke(color)} />
        <Path d="M8 10.5l4 4 4-4" {...stroke(color)} />
        <Path d="M4 17v2a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-2" {...stroke(color)} />
      </>,
    ),

  restart: (color: string, size = 18) =>
    svg(
      size,
      <>
        <Path d="M20.5 12a8.5 8.5 0 1 1-2.5-6L20.5 8.5" {...stroke(color)} />
        <Path d="M20.5 3.5v5h-5" {...stroke(color)} />
      </>,
    ),

  check: (color: string, size = 18) => svg(size, <Path d="M4.5 12.5l5 5L19.5 7" {...stroke(color)} />),

  maximize: (color: string, size = 18) =>
    svg(
      size,
      <>
        <Path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5V9" {...stroke(color)} />
        <Path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9" {...stroke(color)} />
        <Path d="M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15" {...stroke(color)} />
        <Path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" {...stroke(color)} />
      </>,
    ),

  close: (color: string, size = 18) =>
    svg(size, <Path d="M6 6l12 12M18 6L6 18" {...stroke(color)} />),

  plus: (color: string, size = 18) =>
    svg(size, <Path d="M12 5.5v13M5.5 12h13" {...stroke(color)} />),
};
