const SPECIAL_SYMBOLS: Readonly<Record<string, string>> = {
  "　": " ",
  "。": ".",
  "、": ",",
  "【": "[",
  "】": "]",
  "〔": "[",
  "〕": "]",
  "〖": "[",
  "〗": "]",
  "﹙": "(",
  "﹚": ")",
  "﹛": "{",
  "﹜": "}",
  "﹝": "[",
  "﹞": "]",
  "×": "*",
  "✕": "*",
  "✖": "*",
  "÷": "/",
  "−": "-",
  "–": "-",
  "—": "-",
};

/** Converts expression punctuation produced by Chinese/full-width IMEs to parser-safe ASCII. */
export function normalizeExpressionInput(value: string): string {
  return Array.from(value, (character) => {
    const special = SPECIAL_SYMBOLS[character];
    if (special !== undefined) {
      return special;
    }

    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && codePoint >= 0xff01 && codePoint <= 0xff5e) {
      return String.fromCodePoint(codePoint - 0xfee0);
    }

    return character;
  }).join("");
}
