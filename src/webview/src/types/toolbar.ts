// Todo item interface
export interface Todo {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm: string  // Changed to required field since it's always provided in actual usage
}

// File edit information interface
export interface FileEdit {
  name: string
  additions?: number
  deletions?: number
}