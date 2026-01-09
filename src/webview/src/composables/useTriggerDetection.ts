import type { TriggerQuery, TriggerDetectionOptions } from '../types/completion'

/**
 * Trigger Character Detection Composable
 *
 * Used to detect trigger characters in input text (such as '/' or '@') and parse query information
 *
 * @param options Detection options
 * @returns Trigger detection related functions
 *
 * @example
 * const { findQuery, getCaretOffset } = useTriggerDetection({ trigger: '/' })
 * const caret = getCaretOffset(inputElement)
 * const query = findQuery('hello /command world', caret)
 */
export function useTriggerDetection(options: TriggerDetectionOptions) {
  const { trigger, customRegex } = options

  /**
   * Get cursor offset in text
   *
   * @param element contenteditable element
   * @returns Cursor offset, returns undefined on failure
   */
  function getCaretOffset(element: HTMLElement | null): number | undefined {
    if (!element) return undefined

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return undefined

    const range = selection.getRangeAt(0)
    if (!element.contains(range.startContainer)) return undefined

    // Create a range from element start to cursor position
    const preCaretRange = range.cloneRange()
    preCaretRange.selectNodeContents(element)
    preCaretRange.setEnd(range.endContainer, range.endOffset)

    return preCaretRange.toString().length
  }

  /**
   * Find trigger query in text
   *
   * @param text Input text
   * @param caret Cursor position
   * @returns Trigger query information, returns undefined if not found
   */
  function findQuery(text: string, caret: number): TriggerQuery | undefined {
    // Build regular expression
    // Match: trigger character at line start or after space, followed by non-space and non-trigger characters
    const escapedTrigger = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = customRegex || new RegExp(
      `(?:^|\\s)${escapedTrigger}[^\\s${escapedTrigger}]*`,
      'g'
    )

    const matches = Array.from(text.matchAll(regex))

    for (const match of matches) {
      const matchIndex = match.index ?? 0
      // Find actual position of trigger character (may be after a space)
      const start = text.indexOf(trigger, matchIndex)
      const end = start + match[0].trim().length

      // Check if cursor is within trigger range
      if (caret > start && caret <= end) {
        return {
          query: text.substring(start + trigger.length, end),
          start,
          end,
          trigger
        }
      }
    }

    return undefined
  }

  /**
   * Replace trigger range in text
   *
   * @param text Original text
   * @param query Trigger query information
   * @param replacement Replacement text
   * @returns Text after replacement
   */
  function replaceRange(
    text: string,
    query: TriggerQuery,
    replacement: string
  ): string {
    const before = text.substring(0, query.start)
    const after = text.substring(query.end)
    // Automatically add a space if none follows
    const suffix = after.startsWith(' ') ? '' : ' '
    return `${before}${replacement}${suffix}${after}`
  }

  return {
    findQuery,
    getCaretOffset,
    replaceRange
  }
}
