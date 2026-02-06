FROM archlinux:latest

ENV LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

RUN set -e; \
    sed -i 's/^#DisableSandbox/DisableSandbox/' /etc/pacman.conf; \
    awk '{print; if ($0 ~ /^\\[options\\]/) {print "NoExtract = etc/hosts"; print "NoExtract = etc/hostname"; print "NoExtract = etc/resolv.conf"; print "IgnorePkg = filesystem"}}' \
      /etc/pacman.conf > /tmp/pacman.conf && mv /tmp/pacman.conf /etc/pacman.conf; \
    pacman-key --init; \
    pacman-key --populate archlinux; \
    pacman -Syu --noconfirm --noprogressbar --ignore filesystem; \
    pacman -S --noconfirm --noprogressbar --needed \
      ca-certificates curl wget gnupg \
      dbus supervisor \
      xorg-server-xvfb xorg-xauth xorg-xset xorg-xsetroot xorg-xprop xorg-xdpyinfo \
      x11vnc wmctrl \
      openbox xterm rofi thunar xcompmgr adwaita-icon-theme xfce4-panel xfdesktop \
      tmux ttyd \
      nodejs npm \
      python python-pip chromium \
      go rust jdk-openjdk ruby php maven gradle neovim \
      alsa-lib at-spi2-core cairo fontconfig freetype2 gdk-pixbuf2 glib2 gtk3 \
      libsecret libx11 libxcomposite libxdamage libxext libxfixes libxkbcommon libxkbcommon-x11 libxkbfile \
      libxrandr libxrender libxss libxcb libdrm mesa nss pango libxi libxtst libxcursor libxinerama \
      ttf-dejavu ttf-liberation \
      bzip2 \
      procps-ng \
      xdg-utils libcups libgcrypt systemd libpulse pciutils json-glib libva \
      desktop-file-utils hicolor-icon-theme icu libxml2 harfbuzz libvpx libjpeg-turbo \
      re2 snappy ffmpeg flac libwebp minizip libxslt opus; \
    pacman -S --noconfirm --noprogressbar --needed dotnet-sdk || \
      pacman -S --noconfirm --noprogressbar --needed dotnet-sdk-8.0; \
    sed -i 's/^#en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen; \
    locale-gen; \
    pacman -Rns --noconfirm midori firefox || true; \
    pacman -Scc --noconfirm; \
    rm -rf /var/cache/pacman/pkg/*

RUN npm install -g playwright pnpm

ARG ICU_VERSION=75_1
ARG ICU_TAG=75-1
ARG DEBIAN_LIBXML2_VERSION=2.9.10+dfsg-6.7+deb11u4
ARG DEBIAN_LIBICU67_VERSION=67.1-7
ARG DEBIAN_LIBFLAC12_VERSION=1.4.2+ds-2
ARG DEBIAN_ARCH=amd64
ARG DEBIAN_LIB_DIR=x86_64-linux-gnu
ARG NOVNC_VERSION=1.5.0
ARG LITE_XL_VERSION=2.1.8

RUN set -e; \
    pacman -S --noconfirm --noprogressbar --needed gcc make binutils; \
    mkdir -p /tmp/icu-build; \
    curl -fsSL "https://github.com/unicode-org/icu/releases/download/release-${ICU_TAG}/icu4c-${ICU_VERSION}-src.tgz" -o /tmp/icu-build/icu.tgz; \
    tar -xzf /tmp/icu-build/icu.tgz -C /tmp/icu-build; \
    cd /tmp/icu-build/icu/source; \
    ./configure --prefix=/opt/chromium-libs --disable-samples --disable-tests; \
    make -j"$(nproc)"; \
    make install; \
    mkdir -p /tmp/deb/libxml2 /tmp/deb/libicu67 /tmp/deb/libflac12; \
    curl -fsSL "http://deb.debian.org/debian/pool/main/libx/libxml2/libxml2_${DEBIAN_LIBXML2_VERSION}_${DEBIAN_ARCH}.deb" -o /tmp/deb/libxml2/libxml2.deb; \
    (cd /tmp/deb/libxml2 && ar x libxml2.deb && tar -xf data.tar.*); \
    copy_deb_libs() { \
      root="$1"; \
      pattern="$2"; \
      if ! find "$root" -name "$pattern" -print -quit | grep -q .; then \
        echo "missing ${pattern} in ${root}" >&2; \
        find "$root" -maxdepth 4 -type f | head -n 50 >&2; \
        exit 1; \
      fi; \
      for file in $(find "$root" -name "$pattern"); do \
        cp -a "$file" /opt/chromium-libs/lib/; \
      done; \
    }; \
    copy_deb_libs /tmp/deb/libxml2 "libxml2.so.2*"; \
    curl -fsSL "http://deb.debian.org/debian/pool/main/i/icu/libicu67_${DEBIAN_LIBICU67_VERSION}_${DEBIAN_ARCH}.deb" -o /tmp/deb/libicu67/libicu67.deb; \
    (cd /tmp/deb/libicu67 && ar x libicu67.deb && tar -xf data.tar.*); \
    copy_deb_libs /tmp/deb/libicu67 "libicu*.so.67*"; \
    curl -fsSL "http://deb.debian.org/debian/pool/main/f/flac/libflac12_${DEBIAN_LIBFLAC12_VERSION}_${DEBIAN_ARCH}.deb" -o /tmp/deb/libflac12/libflac12.deb; \
    (cd /tmp/deb/libflac12 && ar x libflac12.deb && tar -xf data.tar.*); \
    copy_deb_libs /tmp/deb/libflac12 "libFLAC.so.12*"; \
    rm -rf /tmp/icu-build /tmp/deb; \
    pacman -Scc --noconfirm;
RUN set -e; \
    mkdir -p /opt/novnc; \
    curl -fsSL "https://github.com/novnc/noVNC/archive/refs/tags/v${NOVNC_VERSION}.tar.gz" \
      | tar -xz -C /opt/novnc --strip-components=1; \
    ln -s /opt/novnc /usr/share/novnc; \
    python -m pip install --no-cache-dir --break-system-packages websockify    

RUN set -e; \
    pacman -S --noconfirm --noprogressbar --needed \
      cmake git meson ninja pkgconf wayland wayland-protocols; \
    curl -fsSL "https://github.com/lite-xl/lite-xl/archive/refs/tags/v${LITE_XL_VERSION}.tar.gz" \
      -o /tmp/lite-xl.tar.gz; \
    tar -xzf /tmp/lite-xl.tar.gz -C /tmp; \
    cd "/tmp/lite-xl-${LITE_XL_VERSION}"; \
    bash scripts/build.sh -b build -P; \
    DESTDIR=/opt/lite-xl meson install --skip-subprojects -C build; \
    ln -sf /opt/lite-xl/lite-xl /usr/bin/lite-xl; \
    rm -rf "/tmp/lite-xl-${LITE_XL_VERSION}" /tmp/lite-xl.tar.gz; \
    pacman -Scc --noconfirm

RUN if ! id -u operator >/dev/null 2>&1; then \
      groupadd -f operator; \
      useradd -m -s /bin/bash -g operator operator; \
    fi \
    && mkdir -p /home/operator/.logs /home/operator/.config /home/operator/workspace /config /workspace \
    && chown -R operator:operator /home/operator /config /workspace
RUN printf 'export PS1="Operator:\\w$ "\nunset PROMPT_COMMAND\n' >> /home/operator/.bashrc
RUN printf '%s\n' '#!/bin/sh' \
      'if command -v clear >/dev/null 2>&1; then' \
      '  clear' \
      'else' \
      "  printf '\033[H\033[2J'" \
      'fi' \
    > /clear \
    && chmod +x /clear \
    && mkdir -p /usr/local/bin \
    && ln -sf /clear /new \
    && ln -sf /clear /cls \
    && ln -sf /clear /usr/local/bin/new \
    && ln -sf /clear /usr/local/bin/cls

COPY scripts/ /opt/scripts/
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
RUN chmod +x /opt/scripts/*.sh /opt/scripts/*.js \
    && ln -sf /opt/scripts/mcp-search.js /usr/local/bin/mcp-search \
    && ln -sf /opt/scripts/mcp-read.js /usr/local/bin/mcp-read \
    && /opt/scripts/patch-novnc.sh

ENV DISPLAY=:0

EXPOSE 5900 6080 7681 7682

CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
