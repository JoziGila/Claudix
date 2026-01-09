/**
 * Tool UI context interface
 * Used to access file operations and other functions during Tool rendering
 */
export interface ToolContext {
  fileOpener: {
    open: (filePath: string, location?: { startLine?: number; endLine?: number }) => void;
    openContent: (content: string, fileName: string, editable: boolean) => void;
  };
}

/**
 * Tool permission request renderer interface
 * Different Tools can implement custom permission request UI
 */
export interface ToolPermissionRenderer {
  /**
   * Render permission request UI
   * @param context Tool context
   * @param inputs Tool input parameters
   * @param onModify Callback to modify inputs
   */
  renderPermissionRequest(
    context: ToolContext,
    inputs: any,
    onModify?: (newInputs: any) => void
  ): any;
}
