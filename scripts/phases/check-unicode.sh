#!/usr/bin/env bash
#
# Phase: Check Unicode Braille support (loading indicator)

source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"

detect_platform

CURRENT_LOCALE="${LC_ALL:-${LC_CTYPE:-${LANG:-}}}"
LOCALE_LOWER="$(printf '%s' "$CURRENT_LOCALE" | tr '[:upper:]' '[:lower:]')"
case "$LOCALE_LOWER" in
	*utf-8*|*utf8*)
		ok "UTF-8 locale: ${CURRENT_LOCALE}"
		;;
	"")
		warn "no locale set (LANG/LC_CTYPE/LC_ALL all empty) — braille spinners will likely render as '?'. Set 'export LANG=en_US.UTF-8' in your shell profile."
		;;
	*)
		warn "locale '${CURRENT_LOCALE}' is not UTF-8 — braille spinners will not render. Switch to a UTF-8 locale (e.g. 'export LANG=en_US.UTF-8') in your shell profile."
		;;
esac

# Print a sample frame so the user can confirm font coverage by eye.
printf "${C_BLUE}[info]${C_RESET}  braille spinner preview: ⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏\n"
info "  if the line above shows boxes / '?' / question marks instead of dot patterns,"
info "  install a font with Unicode Braille glyphs (U+2800–U+28FF):"
case "$OS" in
	Darwin)
		info "    macOS bundles Braille glyphs in Menlo / SF Mono / Monaco — pick one in your terminal's font settings."
		;;
	Linux)
		# Best-effort: ask fontconfig whether any installed font covers U+2800.
		if have fc-list && fc-list :charset=2800 2>/dev/null | grep -q .; then
			ok "    fontconfig reports a font with U+2800 coverage already installed"
		else
			if have fc-list; then
				warn "    no font with U+2800 coverage detected via fc-list"
			else
				warn "    fontconfig (fc-list) not present — cannot auto-check font coverage"
			fi
			if have apt-get; then
				info "    Debian/Ubuntu: sudo apt-get install fonts-dejavu fonts-noto"
			elif have dnf; then
				info "    Fedora:        sudo dnf install dejavu-sans-mono-fonts google-noto-fonts-common"
			elif have pacman; then
				info "    Arch:          sudo pacman -S ttf-dejavu noto-fonts"
			else
				info "    Install a font like DejaVu Sans Mono or Noto Sans Symbols2 via your package manager."
			fi
		fi
		;;
esac
