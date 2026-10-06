export const ECL_LABELS = ["7%", "15%", "25%", "30%"] as const;

export const ENCODER_NAMES = [
  "Byte",
  "Alphanumeric",
  "Numeric",
  "Multi-segment",
] as const satisfies string[];
export type EncoderName = (typeof ENCODER_NAMES)[number];
