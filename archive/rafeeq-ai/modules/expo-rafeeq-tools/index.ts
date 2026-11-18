// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Typed JS surface of the `RafeeqTools` native module (Android only).
 *
 * Every method resolves a structured result instead of throwing: `ok` plus
 * either a payload or a stable `code` the agent tools translate into the
 * user's language. Nothing here touches the network.
 */

export interface NativeResult {
  ok: boolean;
  code?: string;
  message?: string;
}

export interface NativeContact {
  name: string;
  phone: string;
}

export interface NativeCalendarEvent {
  id: number;
  title: string;
  startMs: number;
  endMs: number;
  allDay: boolean;
  location: string;
}

export interface RafeeqToolsApi {
  permissionsStatus(): Promise<NativeResult & {
    contacts?: boolean;
    callPhone?: boolean;
    calendarRead?: boolean;
    calendarWrite?: boolean;
    dndPolicy?: boolean;
    writeSettings?: boolean;
  }>;
  contactsSearch(query: string, limit: number): Promise<NativeResult & { contacts?: NativeContact[] }>;
  callNumber(phone: string): Promise<NativeResult & { mode?: 'call' | 'dial' }>;
  draftSms(phone: string | null, body: string): Promise<NativeResult>;
  draftWhatsApp(text: string, phone: string | null): Promise<NativeResult>;
  setAlarmClock(hour: number, minute: number, label: string | null): Promise<NativeResult>;
  setDeviceTimer(seconds: number, label: string | null): Promise<NativeResult>;
  calendarCreate(
    title: string,
    startMs: number,
    endMs: number | null,
    allDay: boolean,
    notes: string | null,
  ): Promise<NativeResult & { eventId?: number }>;
  calendarListUpcoming(daysAhead: number, maxCount: number): Promise<NativeResult & { events?: NativeCalendarEvent[] }>;
  calendarMove(eventId: number, newStartMs: number, newEndMs: number | null): Promise<NativeResult>;
  torchSet(enabled: boolean): Promise<NativeResult>;
  dndSet(enabled: boolean): Promise<NativeResult>;
  brightnessSet(value: number): Promise<NativeResult>;
  openWifiPanel(): Promise<NativeResult>;
  openPermissionSettings(target: 'dnd' | 'write_settings' | 'app'): Promise<NativeResult>;
  /** "All files access" state (Android 11+): supported=false below API 30. */
  allFilesAccessStatus(): Promise<NativeResult & { supported?: boolean; granted?: boolean }>;
  /** Opens the All-files-access Settings screen so the user can grant it. */
  openAllFilesAccessSettings(): Promise<NativeResult>;
  /** Absolute path of the shared Downloads directory (no permission implied). */
  publicDownloadsDir(): Promise<NativeResult & { path?: string }>;
  /** Which launcher-icon alias is active ("default" = the classic icon). */
  launcherIconStatus(): Promise<NativeResult & { supported?: boolean; iconId?: string }>;
  /** Switches the launcher icon (ordered enable-then-disable, never without an icon). */
  setLauncherIcon(iconId: string): Promise<NativeResult & { iconId?: string }>;
}

export const RAFEEQ_TOOLS_MODULE_NAME = 'RafeeqTools';
