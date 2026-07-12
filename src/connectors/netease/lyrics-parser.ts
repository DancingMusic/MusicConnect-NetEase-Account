import type { LyricLine } from "@dancingmusic/music-connect";

export function parseLrc(lrcText: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const regex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/;

  for (const raw of lrcText.split("\n")) {
    const match = raw.match(regex);
    if (!match) continue;

    const min = parseInt(match[1], 10);
    const sec = parseInt(match[2], 10);
    const ms = match[3] ? parseInt(match[3].padEnd(3, "0"), 10) : 0;
    const text = match[4].trim();
    if (!text) continue;

    lines.push({ time: min * 60 + sec + ms / 1000, text });
  }

  return lines.sort((a, b) => a.time - b.time);
}

export function mergeLyrics(original: LyricLine[], translated: LyricLine[]): LyricLine[] {
  const transMap = new Map<number, string>();
  for (const line of translated) {
    const key = Math.round(line.time * 10);
    transMap.set(key, line.text);
  }

  return original.map(line => {
    const key = Math.round(line.time * 10);
    const trans = transMap.get(key);
    return trans ? { ...line, translated: trans } : line;
  });
}
