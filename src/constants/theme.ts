export type ColorScheme = "light" | "dark";

const dark = {
    background: "#1c1c1e",
    // Same as background, as "r, g, b" so gradients can fade it to transparent
    backgroundRgb: "28, 28, 30",
    surface: "#2c2c2e",
    surfacePressed: "#3a3a3c",
    text: "#ffffff",
    textSecondary: "#d1d1d6",
    textMuted: "#8e8e93",
    textFaint: "rgba(255,255,255,0.4)",
    border: "rgba(255,255,255,0.12)",
    fill: "rgba(255,255,255,0.1)",
    fillPressed: "rgba(255,255,255,0.18)",
    // Selected segment of a segmented control
    selected: "rgba(255,255,255,0.22)",
    rank: "#3a3a3c",
    rating: "#ffd60a",
    danger: "#FF453A",
    link: "#0a84ff",
    accent: "#ef4444",
    backdrop: "rgba(0,0,0,0.6)",
    glassFallback: "rgba(28,28,30,0.97)",
};

// Calm, warm off-white palette — matches the splash background
const light: typeof dark = {
    background: "#f4f2ee",
    backgroundRgb: "244, 242, 238",
    surface: "#ffffff",
    surfacePressed: "#ebe7e1",
    text: "#26231f",
    textSecondary: "#4d4842",
    textMuted: "#8c857b",
    textFaint: "rgba(38,35,31,0.4)",
    border: "rgba(38,35,31,0.1)",
    fill: "rgba(38,35,31,0.06)",
    fillPressed: "rgba(38,35,31,0.12)",
    selected: "#ffffff",
    rank: "#dcd7cf",
    rating: "#b7860b",
    danger: "#d93a30",
    link: "#2f6fb3",
    accent: "#e05252",
    backdrop: "rgba(38,35,31,0.35)",
    glassFallback: "rgba(250,248,245,0.97)",
};

export type Colors = typeof dark;

export const COLORS: Record<ColorScheme, Colors> = { dark, light };

// Content drawn over posters/backdrops stays light in both themes
export const ON_IMAGE = {
    text: "#ffffff",
    textSecondary: "#d1d1d6",
    scrim: "rgba(0,0,0,0.45)",
    rating: "#ffd60a",
};
