import { ref, computed, watch } from 'vue'
import type {
  CompletionConfig,
  CompletionDropdown,
  DropdownPosition,
  TriggerQuery
} from '../types/completion'
import type { DropdownItemType } from '../types/dropdown'
import { useTriggerDetection } from './useTriggerDetection'
import { useKeyboardNavigation } from './useKeyboardNavigation'

/**
 * Generic Completion Dropdown Composable
 *
 * Encapsulates complete dropdown completion logic, supporting two modes:
 * - inline: Input triggered (e.g., /command, @file)
 * - manual: Manually triggered (e.g., button click)
 *
 * @param config Completion configuration
 * @returns Completion dropdown state and methods
 *
 * @example
 * // inline mode
 * const slashCompletion = useCompletionDropdown({
 *   mode: 'inline',
 *   trigger: '/',
 *   provider: getSlashCommands,
 *   toDropdownItem: (cmd) => ({ ... }),
 *   onSelect: (cmd, query) => { ... },
 *   anchorElement: inputRef
 * })
 *
 * @example
 * // manual mode
 * const commandMenu = useCompletionDropdown({
 *   mode: 'manual',
 *   provider: getCommands,
 *   toDropdownItem: (cmd) => ({ ... }),
 *   onSelect: (cmd) => { ... }
 * })
 */
export function useCompletionDropdown<T>(
  config: CompletionConfig<T>
): CompletionDropdown {
  const {
    mode,
    trigger,
    provider,
    toDropdownItem,
    onSelect,
    anchorElement,
    showSectionHeaders = false,
    searchFields = ['label', 'detail'],
    sectionOrder = []
  } = config

  // Validate configuration
  if (mode === 'inline' && !trigger) {
    throw new Error('[useCompletionDropdown] inline mode requires trigger parameter')
  }

  // === State management ===
  const isOpen = ref(false)
  const activeIndex = ref(0)
  const query = ref('')
  const triggerQuery = ref<TriggerQuery | undefined>(undefined)
  const rawItems = ref<T[]>([])
  const navigationMode = ref<'keyboard' | 'mouse'>('keyboard') // Navigation mode

  // === Trigger detection (inline mode) ===
  const triggerDetection = mode === 'inline' && trigger
    ? useTriggerDetection({ trigger })
    : null

  // === Data loading (serialization + race condition protection + debounce + AbortController) ===
  const requestSeq = ref(0)
  const isLoading = ref(false)
  let debounceTimerId: number | undefined
  let currentAbortController: AbortController | undefined

  async function loadItems(searchQuery: string, signal?: AbortSignal) {
    try {
      // Increment request number, only allow latest request to write
      const seq = ++requestSeq.value
      isLoading.value = true

      const result = provider(searchQuery, signal)
      const data = result instanceof Promise ? await result : result

      // Only accept latest request
      if (seq === requestSeq.value) {
        rawItems.value = (data ?? []) as T[]
      }
    } catch (error) {
      // If AbortError, handle silently
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }
      console.error('[useCompletionDropdown] Failed to load data:', error)
      rawItems.value = []
    } finally {
      isLoading.value = false
    }
  }

  // Debounced loading (inline mode only, 200ms delay + AbortController support)
  function loadItemsDebounced(searchQuery: string, delay = 200) {
    // Clear previous debounce timer
    if (debounceTimerId !== undefined) {
      window.clearTimeout(debounceTimerId)
    }

    // Abort previous request
    if (currentAbortController) {
      currentAbortController.abort()
      currentAbortController = undefined
    }

    debounceTimerId = window.setTimeout(() => {
      // Create new AbortController
      currentAbortController = new AbortController()
      void loadItems(searchQuery, currentAbortController.signal)
    }, delay)
  }

  // === Item list processing ===
  const items = computed<DropdownItemType[]>(() => {
    if (rawItems.value.length === 0) return []

    // Convert to DropdownItem format
    const source = (rawItems.value as unknown as T[]) || []
    let dropdownItems = source.map((it) => toDropdownItem(it as T))

    // manual mode: process grouping
    if (mode === 'manual' && showSectionHeaders) {
      dropdownItems = organizeItemsWithSections(dropdownItems)
    }

    return dropdownItems
  })

  // Organize items into grouped format
  function organizeItemsWithSections(items: DropdownItemType[]): DropdownItemType[] {
    if (!showSectionHeaders) return items

    const result: DropdownItemType[] = []
    const grouped = new Map<string, DropdownItemType[]>()

    // Group by section
    for (const item of items) {
      const section = (item as any).section || 'Other'
      if (!grouped.has(section)) {
        grouped.set(section, [])
      }
      grouped.get(section)!.push(item)
    }

    // Output in specified order
    const sections = sectionOrder.length > 0
      ? sectionOrder
      : Array.from(grouped.keys())

    for (const section of sections) {
      const sectionItems = grouped.get(section)
      if (!sectionItems || sectionItems.length === 0) continue

      // Add separator (except first)
      if (result.length > 0) {
        result.push({
          id: `separator-${section}`,
          type: 'separator'
        } as DropdownItemType)
      }

      // Add section header
      result.push({
        id: `section-${section}`,
        type: 'section-header',
        text: section
      } as DropdownItemType)

      // Add items
      result.push(...sectionItems)
    }

    return result
  }

  // Navigable items (excluding separators and headers)
  const navigableItems = computed<T[]>(() => rawItems.value as unknown as T[])

  // === Position calculation ===
  const positionRef = ref<DropdownPosition>({ top: 0, left: 0, width: 0, height: 0 })
  const position = computed<DropdownPosition>(() => positionRef.value)

  // Update position (can be called externally)
  function updatePosition(pos: DropdownPosition) {
    positionRef.value = pos
  }

  // Default position update (based on anchorElement)
  function updateDefaultPosition() {
    if (!anchorElement?.value) {
      positionRef.value = { top: 0, left: 0, width: 0, height: 0 }
      return
    }

    const rect = anchorElement.value.getBoundingClientRect()
    positionRef.value = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height
    }
  }

  // === Keyboard navigation ===
  const navigation = useKeyboardNavigation({
    isOpen,
    items: computed(() => navigableItems.value),
    activeIndex,
    onSelect: (index) => {
      const item = navigableItems.value[index] as unknown as T
      if (item != null) {
        onSelect(item as T, triggerQuery.value)
        close()
      }
    },
    onClose: close,
    supportTab: true,
    supportEscape: mode === 'inline', // inline mode supports Escape
    onNavigate: () => {
      // Switch to keyboard mode during keyboard navigation
      navigationMode.value = 'keyboard'
    }
  })

  // === inline mode: query evaluation ===
  function evaluateQuery(text: string, caretOffset?: number) {
    if (mode !== 'inline' || !triggerDetection) return

    // Get cursor position
    const caret = caretOffset ?? triggerDetection.getCaretOffset(anchorElement?.value || null)
    if (caret === undefined) {
      triggerQuery.value = undefined
      isOpen.value = false
      return
    }

    // Find trigger query
    const foundQuery = triggerDetection.findQuery(text, caret)
    triggerQuery.value = foundQuery

    if (foundQuery) {
      query.value = foundQuery.query
      isOpen.value = true
      activeIndex.value = 0
      // Use debounced loading to avoid frequent requests (200ms delay)
      loadItemsDebounced(foundQuery.query)
    } else {
      isOpen.value = false
    }
  }

  // === inline mode: text replacement ===
  function replaceText(text: string, replacement: string): string {
    if (mode !== 'inline' || !triggerDetection || !triggerQuery.value) {
      return text
    }

    return triggerDetection.replaceRange(text, triggerQuery.value, replacement)
  }

  // === manual mode: open/close ===
  function open() {
    isOpen.value = true
    activeIndex.value = 0
    query.value = ''
    void loadItems('')
  }

  function close() {
    isOpen.value = false
    activeIndex.value = -1 // Reset to -1 when closing
    query.value = ''
    triggerQuery.value = undefined
    rawItems.value = []
    navigationMode.value = 'keyboard' // Reset navigation mode
  }

  // === Mouse interaction ===
  function handleMouseEnter(index: number) {
    navigationMode.value = 'mouse'
    activeIndex.value = index
  }

  function handleMouseLeave() {
    // Reset index to -1 on mouse leave (indicates no selected item)
    activeIndex.value = -1
  }

  // === manual mode: search (debounced) ===
  let debounceTimer: number | undefined
  function handleSearch(term: string) {
    query.value = term
    activeIndex.value = 0
    if (debounceTimer) window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => {
      void loadItems(term)
    }, 120)
  }

  // === Keyboard event handling ===
  function handleKeydown(event: KeyboardEvent) {
    navigation.handleKeydown(event)
  }

  // === Direct selection of current/specified item (for mouse click scenarios, etc.) ===
  function selectActive() {
    // Reuse navigation selection logic
    navigation.selectActive()
  }

  function selectIndex(index: number) {
    if (index < 0 || index >= navigableItems.value.length) return
    activeIndex.value = index
    const item = navigableItems.value[index] as unknown as T
    if (item != null) {
      onSelect(item as T, triggerQuery.value)
      close()
    }
  }

  // === Reload on query change (manual mode only, inline mode triggered by evaluateQuery) ===
  // inline mode already calls loadItemsDebounced in evaluateQuery, avoiding duplicate triggers
  watch(query, (newQuery) => {
    // inline mode no longer triggers loading via watch, preventing duplicate calls
    if (mode === 'inline') return
    // manual mode triggered by handleSearch
    if (mode === 'manual') return

    if (isOpen.value) void loadItems(newQuery)
  })

  // === Constrain selected index on list change, avoiding out-of-bounds ===
  watch(items, (list) => {
    const len = list.length
    if (len === 0) {
      activeIndex.value = -1
      return
    }
    if (activeIndex.value < 0) activeIndex.value = 0
    if (activeIndex.value >= len) activeIndex.value = len - 1
  })

  return {
    isOpen,
    items,
    activeIndex,
    position,
    query,
    triggerQuery,
    navigationMode,
    // Expose loading (optional use)
    // @ts-expect-error: Extra exposed state, backward compatible
    loading: isLoading,
    open,
    close,
    handleKeydown,
    selectActive,
    selectIndex,
    handleSearch,
    evaluateQuery,
    replaceText,
    handleMouseEnter,
    handleMouseLeave,
    updatePosition
  }
}
