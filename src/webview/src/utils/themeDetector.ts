import { ref, onMounted, onUnmounted } from 'vue';

/**
 * Detects VSCode dark/light theme from document.body.classList
 * and watches for theme changes via MutationObserver.
 */
export function useThemeDetector() {
  const isDark = ref(true);

  const detectTheme = () => {
    const body = document.body;
    // VSCode adds 'vscode-dark', 'vscode-light', or 'vscode-high-contrast' class to body
    isDark.value = body.classList.contains('vscode-dark') ||
                   body.classList.contains('vscode-high-contrast');
  };

  let observer: MutationObserver | null = null;

  onMounted(() => {
    detectTheme();

    // Watch for theme changes via MutationObserver
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          detectTheme();
          break;
        }
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
  });

  onUnmounted(() => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  });

  return { isDark };
}
