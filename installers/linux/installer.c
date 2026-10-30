/*
 * Win95 NAS - Linux installer (single-file ELF).
 *
 * The application payload (tar.gz) is embedded in this binary. Running the
 * file unpacks the NAS into ~/.local/share/win95nas, adds a `win95nas`
 * launcher in ~/.local/bin and a desktop entry, then starts the app.
 *
 * Overrides (handy for testing):
 *   WIN95NAS_INSTALL_DIR   install somewhere else
 *   WIN95NAS_NO_LAUNCH=1   install but do not start the server
 */
#define _GNU_SOURCE
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

#include "payload.h"

static int mkdirs(const char *path) {
  char tmp[4096];
  snprintf(tmp, sizeof tmp, "%s", path);
  for (char *p = tmp + 1; *p; p += 1) {
    if (*p == '/') {
      *p = '\0';
      if (mkdir(tmp, 0755) != 0 && errno != EEXIST) return -1;
      *p = '/';
    }
  }
  if (mkdir(tmp, 0755) != 0 && errno != EEXIST) return -1;
  return 0;
}

static int has_python(void) {
  return system("command -v python3 >/dev/null 2>&1") == 0;
}

int main(void) {
  const char *home = getenv("HOME");
  if (!home || !*home) home = ".";

  char dest[4096];
  const char *override = getenv("WIN95NAS_INSTALL_DIR");
  if (override && *override) snprintf(dest, sizeof dest, "%s", override);
  else snprintf(dest, sizeof dest, "%s/.local/share/win95nas", home);

  char tmpfile[4096];
  snprintf(tmpfile, sizeof tmpfile, "/tmp/win95nas-payload-XXXXXX");
  int fd = mkstemp(tmpfile);
  if (fd < 0) {
    perror("  cannot create temporary file");
    return 1;
  }
  size_t off = 0;
  while (off < payload_len) {
    ssize_t n = write(fd, payload + off, payload_len - off);
    if (n <= 0) {
      perror("  cannot write payload");
      close(fd);
      unlink(tmpfile);
      return 1;
    }
    off += (size_t)n;
  }
  close(fd);

  printf("\n  Win95 NAS installer\n");
  printf("  -------------------\n");
  printf("  Installing to %s\n\n", dest);

  if (mkdirs(dest) != 0) {
    perror("  cannot create install folder");
    unlink(tmpfile);
    return 1;
  }

  char cmd[8192];
  snprintf(cmd, sizeof cmd, "tar -xzf '%s' -C '%s'", tmpfile, dest);
  if (system(cmd) != 0) {
    fprintf(stderr, "  could not unpack the application files\n");
    unlink(tmpfile);
    return 1;
  }
  unlink(tmpfile);

  char bin[4096];
  snprintf(bin, sizeof bin, "%s/.local/bin", home);
  mkdirs(bin);

  char launcher[4096];
  snprintf(launcher, sizeof launcher, "%s/win95nas", bin);
  FILE *f = fopen(launcher, "w");
  if (!f) {
    perror("  cannot create launcher");
    return 1;
  }
  fprintf(f, "#!/bin/sh\ncd \"%s\" && exec python3 launcher.py \"$@\"\n", dest);
  fclose(f);
  chmod(launcher, 0755);

  char apps[4096];
  snprintf(apps, sizeof apps, "%s/.local/share/applications", home);
  mkdirs(apps);
  char entry[4096];
  snprintf(entry, sizeof entry, "%s/win95nas.desktop", apps);
  f = fopen(entry, "w");
  if (f) {
    fprintf(f,
            "[Desktop Entry]\n"
            "Type=Application\n"
            "Name=Win95 NAS\n"
            "Comment=A 1995 network drive\n"
            "Exec=%s/win95nas\n"
            "Terminal=true\n"
            "Categories=Utility;\n",
            bin);
    fclose(f);
  }

  if (!has_python()) {
    printf("  Python 3.11 or newer was not found.\n");
    printf("  Install it with your package manager, then run: win95nas\n\n");
    return 0;
  }

  printf("  Installed. Run \"win95nas\" (or the Win95 NAS menu entry).\n\n");
  if (getenv("WIN95NAS_NO_LAUNCH")) return 0;

  if (chdir(dest) != 0) {
    perror("  cannot enter install folder");
    return 1;
  }
  execlp("python3", "python3", "launcher.py", (char *)NULL);
  perror("  cannot start python3");
  return 1;
}
