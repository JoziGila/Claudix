// Generic dropdown menu item data interface
export interface DropdownItemData {
  id: string
  label?: string        // Display text
  name?: string         // Alternative display text
  detail?: string       // Auxiliary info (e.g., file path, description, etc.)
  icon?: string         // Left icon CSS class
  rightIcon?: string    // Right icon CSS class (e.g., arrow)
  checked?: boolean     // Whether selected
  disabled?: boolean    // Whether disabled
  type?: string         // Item type (for business logic)
  data?: any           // Additional data
  [key: string]: any   // Allow extended fields
}

// Dropdown component item type
export interface DropdownItem {
  id: string
  label: string
  name?: string
  detail?: string
  icon?: string
  rightIcon?: string
  checked?: boolean
  disabled?: boolean
  type?: string
  data?: any
}

// Extended types: separator and section header
export interface DropdownSeparator {
  type: 'separator'
  id: string
}

export interface DropdownSectionHeader {
  type: 'section-header'
  id: string
  text?: string
}

// Union type: contains all possible dropdown item types
export type DropdownItemType = DropdownItemData | DropdownSeparator | DropdownSectionHeader

// Type guard functions
export function isDropdownItemData(item: DropdownItemType): item is DropdownItemData {
  return item.type !== 'separator' && item.type !== 'section-header'
}

export function isDropdownSeparator(item: DropdownItemType): item is DropdownSeparator {
  return item.type === 'separator'
}

export function isDropdownSectionHeader(item: DropdownItemType): item is DropdownSectionHeader {
  return item.type === 'section-header'
}

// Export all types
export type { DropdownItemData as DropdownItemDataType }