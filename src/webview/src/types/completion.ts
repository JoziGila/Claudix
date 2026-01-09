import type { Ref, ComputedRef } from 'vue'
import type { DropdownItemType } from './dropdown'

/**
 * Trigger query information
 * Records trigger character, query text and position range
 */
export interface TriggerQuery {
  /** Query text (excluding trigger character) */
  query: string
  /** Start position of trigger character in text */
  start: number
  /** Query end position */
  end: number
  /** Trigger character (e.g., '/' or '@') */
  trigger: string
}

/**
 * Dropdown position information
 */
export interface DropdownPosition {
  top: number
  left: number
  width: number
  height: number
}

/**
 * Completion mode
 * - inline: Input triggered (e.g., /command, @file)
 * - manual: Manually triggered (e.g., button click)
 */
export type CompletionMode = 'inline' | 'manual'

/**
 * Completion configuration options
 */
export interface CompletionConfig<T> {
  /** Completion mode */
  mode: CompletionMode

  /** Trigger character (required for inline mode, e.g., '/' or '@') */
  trigger?: string

  /** Data provider function (supports optional AbortSignal for request cancellation) */
  provider: (query: string, signal?: AbortSignal) => Promise<T[]> | T[]

  /** Convert data item to DropdownItem format */
  toDropdownItem: (item: T) => DropdownItemType

  /** Callback when item is selected */
  onSelect: (item: T, query?: TriggerQuery) => void

  /** Anchor element for positioning (used to calculate dropdown position) */
  anchorElement?: Ref<HTMLElement | null>

  /** Whether to show section headers (manual mode) */
  showSectionHeaders?: boolean

  /** List of search fields (for filtering, manual mode) */
  searchFields?: string[]

  /** Command section order (manual mode, optional) */
  sectionOrder?: readonly string[]
}

/**
 * Completion dropdown return value
 */
export interface CompletionDropdown {
  /** Whether open */
  isOpen: Ref<boolean>

  /** Dropdown items list */
  items: ComputedRef<DropdownItemType[]>

  /** Current active index */
  activeIndex: Ref<number>

  /** Dropdown position */
  position: ComputedRef<DropdownPosition>

  /** Current query text */
  query: Ref<string>

  /** Current trigger query info (inline mode) */
  triggerQuery: Ref<TriggerQuery | undefined>

  /** Navigation mode */
  navigationMode: Ref<'keyboard' | 'mouse'>

  /** Open dropdown */
  open: () => void

  /** Close dropdown */
  close: () => void

  /** Keyboard event handler */
  handleKeydown: (event: KeyboardEvent) => void

  /** Select current active item (for click trigger, etc.) */
  selectActive: () => void

  /** Select item by index (for click trigger, etc.) */
  selectIndex: (index: number) => void

  /** Search handler (manual mode) */
  handleSearch: (term: string) => void

  /** Evaluate query (internal use for inline mode) */
  evaluateQuery: (text: string, caretOffset?: number) => void

  /** Text replacement (inline mode) */
  replaceText: (text: string, replacement: string) => string

  /** Mouse enter item (switch to mouse mode) */
  handleMouseEnter: (index: number) => void

  /** Mouse leave menu (reset index) */
  handleMouseLeave: () => void

  /** Manually update position */
  updatePosition: (pos: DropdownPosition) => void
}

/**
 * Keyboard navigation options
 */
export interface KeyboardNavigationOptions {
  /** Whether open */
  isOpen: Ref<boolean>

  /** Items list */
  items: ComputedRef<any[]>

  /** Current active index */
  activeIndex: Ref<number>

  /** Callback when current item is selected */
  onSelect: (index: number) => void

  /** Callback when closed */
  onClose: () => void

  /** Whether Tab key selection is supported */
  supportTab?: boolean

  /** Whether Escape key close is supported */
  supportEscape?: boolean

  /** Callback when navigation occurs (for switching navigation mode) */
  onNavigate?: () => void

  /** Page size (default 5) */
  pageSize?: number
}

/**
 * Trigger detection options
 */
export interface TriggerDetectionOptions {
  /** Trigger character */
  trigger: string

  /** Custom regular expression (optional) */
  customRegex?: RegExp
}
