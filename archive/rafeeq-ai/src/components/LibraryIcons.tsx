// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Stroke icons for the model library's twelve categories. One shared 24×24
 * viewBox, `strokeWidth` 1.9, no fills — the same hand-drawn language as the
 * app's existing glyph components, so the library reads native everywhere.
 */
import { Svg, Path, Circle, Rect } from 'react-native-svg';

function chat(color: string) {
  return (
    <Path
      d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H12l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5v-7Z"
      stroke={color}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  );
}

function mic(color: string) {
  return (
    <>
      <Rect x={9} y={3} width={6} height={11} rx={3} stroke={color} strokeWidth={1.9} fill="none" />
      <Path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" stroke={color} strokeWidth={1.9} strokeLinecap="round" fill="none" />
    </>
  );
}

function speaker(color: string) {
  return (
    <>
      <Path d="M4 9.5v5h3.5L13 19V5L7.5 9.5H4Z" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" stroke={color} strokeWidth={1.9} strokeLinecap="round" fill="none" />
    </>
  );
}

function image(color: string) {
  return (
    <>
      <Rect x={3.5} y={4.5} width={17} height={15} rx={2.5} stroke={color} strokeWidth={1.9} fill="none" />
      <Circle cx={9} cy={10} r={1.6} stroke={color} strokeWidth={1.7} fill="none" />
      <Path d="M4.5 17.5 10 12l4 4 2.5-2.5 3 3" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  );
}

function video(color: string) {
  return (
    <>
      <Rect x={3} y={6} width={13} height={12} rx={2.5} stroke={color} strokeWidth={1.9} fill="none" />
      <Path d="m16 10.5 5-3v9l-5-3" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  );
}

function wave(color: string) {
  return (
    <>
      <Path d="M4 12h2M8.5 7v10M12 4v16M15.5 8v8M20 11h-2" stroke={color} strokeWidth={1.9} strokeLinecap="round" fill="none" />
    </>
  );
}

function wand(color: string) {
  return (
    <>
      <Path d="m5 19 9.5-9.5M13 4.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1ZM19 11l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6.6-1.4Z" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="m12.5 11.5 2 2" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    </>
  );
}

function eye(color: string) {
  return (
    <>
      <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={1.9} fill="none" />
    </>
  );
}

function code(color: string) {
  return (
    <>
      <Path d="m8 8-4.5 4L8 16M16 8l4.5 4L16 16M13.5 5l-3 14" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  );
}

function cube(color: string) {
  return (
    <>
      <Path d="M12 2.8 20.5 7v10L12 21.2 3.5 17V7L12 2.8Z" stroke={color} strokeWidth={1.9} strokeLinejoin="round" fill="none" />
      <Path d="M3.5 7 12 11.4 20.5 7M12 11.4v9.8" stroke={color} strokeWidth={1.9} strokeLinejoin="round" fill="none" />
    </>
  );
}

function globe(color: string) {
  return (
    <>
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.9} fill="none" />
      <Path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3Z" stroke={color} strokeWidth={1.9} strokeLinecap="round" fill="none" />
    </>
  );
}

function flask(color: string) {
  return (
    <>
      <Path d="M9.5 3.5h5M10.5 3.5v5.2L4.8 17.6a2.2 2.2 0 0 0 2 3.1h10.4a2.2 2.2 0 0 0 2-3.1L13.5 8.7V3.5" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M7.5 14.5h9" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    </>
  );
}

function book(color: string) {
  return (
    <>
      <Path d="M4.5 5.5A1.9 1.9 0 0 1 6.4 3.6h12.1v16H6.4a1.9 1.9 0 0 0-1.9 1.9v-16Z" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M4.5 19.6V5.5M9 8h5.5M9 11.5h5.5" stroke={color} strokeWidth={1.9} strokeLinecap="round" fill="none" />
    </>
  );
}

function doc(color: string) {
  return (
    <>
      <Path d="M6 3.5h8.5L19 8v12.5H6V3.5Z" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M14 3.8V8.3h4.6M9 12.5h6M9 16h6" stroke={color} strokeWidth={1.9} strokeLinecap="round" fill="none" />
    </>
  );
}

function chart(color: string) {
  return (
    <>
      <Path d="M4 4v16h16" stroke={color} strokeWidth={1.9} strokeLinecap="round" fill="none" />
      <Path d="M8 16.5v-5M12 16.5v-9M16 16.5v-3" stroke={color} strokeWidth={1.9} strokeLinecap="round" fill="none" />
    </>
  );
}

function bolt(color: string) {
  return (
    <Path d="M13 3 5.5 13.5H11L10 21l7.5-10.5H12L13 3Z" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  );
}

function layers(color: string) {
  return (
    <>
      <Path d="m12 3.5 8.5 4.5L12 12.5 3.5 8 12 3.5Z" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="m4.5 12.5 7.5 4 7.5-4M4.5 16.5l7.5 4 7.5-4" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  );
}

function shield(color: string) {
  return (
    <Path d="M12 3.5 19 6v6c0 4.5-3 7.4-7 8.5-4-1.1-7-4-7-8.5V6l7-2.5Z" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  );
}

function grid(color: string) {
  return (
    <>
      <Rect x={4} y={4} width={7} height={7} rx={1.6} stroke={color} strokeWidth={1.9} fill="none" />
      <Rect x={13} y={4} width={7} height={7} rx={1.6} stroke={color} strokeWidth={1.9} fill="none" />
      <Rect x={4} y={13} width={7} height={7} rx={1.6} stroke={color} strokeWidth={1.9} fill="none" />
      <Rect x={13} y={13} width={7} height={7} rx={1.6} stroke={color} strokeWidth={1.9} fill="none" />
    </>
  );
}

function spark(color: string) {
  return (
    <Path d="M12 3.5c.8 3.8 2.7 5.7 6.5 6.5-3.8.8-5.7 2.7-6.5 6.5-.8-3.8-2.7-5.7-6.5-6.5 3.8-.8 5.7-2.7 6.5-6.5ZM18.5 15.5c.4 1.7 1.3 2.6 3 3-1.7.4-2.6 1.3-3 3-.4-1.7-1.3-2.6-3-3 1.7-.4 2.6-1.3 3-3Z" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  );
}

function bell(color: string) {
  return (
    <>
      <Path d="M6 16.5v-5a6 6 0 0 1 12 0v5l1.5 2.5h-15L6 16.5Z" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M10 19a2 2 0 0 0 4 0" stroke={color} strokeWidth={1.9} strokeLinecap="round" fill="none" />
    </>
  );
}

function location(color: string) {
  return (
    <>
      <Path d="M12 21s6.5-6 6.5-11a6.5 6.5 0 0 0-13 0C5.5 15 12 21 12 21Z" stroke={color} strokeWidth={1.9} strokeLinejoin="round" fill="none" />
      <Circle cx={12} cy={10} r={2.4} stroke={color} strokeWidth={1.9} fill="none" />
    </>
  );
}

function finger(color: string) {
  return (
    <Path d="M8 20c-.8-2.2-1.3-4.6-1.3-7a5.3 5.3 0 0 1 10.6 0c0 1.4-.1 2.7-.4 4M12 20c-.6-2-1-4-1-7a1.6 1.6 0 0 1 3.2 0c0 1.9.2 3.7.7 5.5M5.4 9a7.5 7.5 0 0 1 13.2 0" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  );
}

function contacts(color: string) {
  return (
    <>
      <Circle cx={12} cy={9} r={3.2} stroke={color} strokeWidth={1.9} fill="none" />
      <Path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" stroke={color} strokeWidth={1.9} strokeLinecap="round" fill="none" />
    </>
  );
}

function calendar(color: string) {
  return (
    <>
      <Rect x={4} y={5.5} width={16} height={15} rx={2.2} stroke={color} strokeWidth={1.9} fill="none" />
      <Path d="M4 10.5h16M8.5 3.5v4M15.5 3.5v4" stroke={color} strokeWidth={1.9} strokeLinecap="round" fill="none" />
    </>
  );
}

function phone(color: string) {
  return (
    <Path d="M8.5 4h7A1.5 1.5 0 0 1 17 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 18.5v-13A1.5 1.5 0 0 1 8.5 4ZM10.5 17h3" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  );
}

function moon(color: string) {
  return (
    <Path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  );
}

function gear(color: string) {
  return (
    <>
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={1.9} fill="none" />
      <Path d="M12 3.8v2.4M12 17.8v2.4M20.2 12h-2.4M6.2 12H3.8M17.8 6.2l-1.7 1.7M7.9 16.1l-1.7 1.7M17.8 17.8l-1.7-1.7M7.9 7.9 6.2 6.2" stroke={color} strokeWidth={1.9} strokeLinecap="round" fill="none" />
    </>
  );
}

const RENDERERS: Record<string, (color: string) => React.ReactNode> = {
  chat,
  mic,
  speaker,
  image,
  video,
  wave,
  wand,
  eye,
  code,
  cube,
  globe,
  flask,
  // Onboarding goals (and the permission rows) reuse the same glyph language.
  book,
  doc,
  chart,
  bolt,
  layers,
  shield,
  grid,
  spark,
  bell,
  location,
  finger,
  contacts,
  calendar,
  phone,
  moon,
  gear,
};

/** Renders by icon name (the `icon` field on a LibraryCategory). */
export function CategoryGlyph({ icon, color, size = 24 }: { icon: string; color: string; size?: number }) {
  const render = RENDERERS[icon] ?? chat;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {render(color)}
    </Svg>
  );
}
