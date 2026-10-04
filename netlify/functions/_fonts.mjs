import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Fonts for the resvg PNG endpoints (name-chart-image, ai-agent-share-image).
//
// Netlify Functions run on AWS Lambda, which ships no font faces at all, and
// resvg silently drops every <text> node it cannot find a face for -- so with
// system fonts alone the rendered PNGs came out as frames and tiles with no
// words or numbers on them. The site serves Fraunces and Inter to browsers as
// woff2, which resvg cannot read, so static TTF cuts of the same faces sit
// beside them in assets/fonts/ (Google Fonts' static Fraunces 700 and Inter
// 400/700 instances, latin + latin-ext, OFL -- see OFL-*.txt there). They
// reach the function bundle through each function's included_files in
// netlify.toml.
export const FONT_DIRECTORY = 'assets/fonts';
export const DEFAULT_FAMILY = 'Inter';

export function resolveFontFiles(directory = FONT_DIRECTORY, root = process.cwd()) {
  try {
    const absolute = join(root, directory);
    if (!existsSync(absolute)) {
      return [];
    }
    return readdirSync(absolute)
      .filter((entry) => /\.(ttf|otf)$/i.test(entry))
      .sort()
      .map((entry) => join(absolute, entry));
  } catch (_error) {
    return [];
  }
}

// With the bundled faces present, rendering ignores the host's fonts entirely:
// the output is the same locally and on Lambda, and resvg skips the system
// font scan. A stack whose first family is not bundled (Arial, Georgia,
// sans-serif) falls back to defaultFontFamily rather than to nothing. Only
// when the bundle is missing do we fall back to whatever the host provides.
export function buildResvgFontOptions(fontFiles = resolveFontFiles()) {
  if (!fontFiles.length) {
    return { loadSystemFonts: true };
  }
  return { fontFiles, loadSystemFonts: false, defaultFontFamily: DEFAULT_FAMILY };
}
