#include <mach-o/dyld.h>
#include <limits.h>
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

int main(void) {
  char executablePath[PATH_MAX];
  uint32_t size = sizeof(executablePath);

  if (_NSGetExecutablePath(executablePath, &size) != 0) {
    return 1;
  }

  char resolvedPath[PATH_MAX];
  if (realpath(executablePath, resolvedPath) == NULL) {
    return 1;
  }

  for (int i = 0; i < 4; i += 1) {
    char *lastSlash = strrchr(resolvedPath, '/');
    if (lastSlash == NULL) {
      return 1;
    }
    *lastSlash = '\0';
  }

  char command[PATH_MAX + 128];
  int written = snprintf(
    command,
    sizeof(command),
    "\"%s/scripts/session-control-launcher.zsh\" >/dev/null 2>&1 &",
    resolvedPath
  );

  if (written < 0 || (size_t)written >= sizeof(command)) {
    return 1;
  }

  return system(command) == -1 ? 1 : 0;
}
