import type { ClerkProviderProps } from "@clerk/clerk-react";

type Appearance = NonNullable<ClerkProviderProps["appearance"]>;

// Clerk derives shades from these, so they must be literal colours rather
// than CSS variables. Keep in sync with the palette in src/index.css.
const ink = "#111D1D";
const white = "#FFFFFF";
const silverLight = "#F0F3F4";
const silver = "#BDC4C8";
const turquoise = "#1FB2A3";
const turquoiseDeep = "#176D68";
const pink = "#D51A68";
const pinkDeep = "#B21356";
const border = "rgba(17, 29, 29, 0.14)";
const mutedInk = "rgba(17, 29, 29, 0.62)";
const display = "'Bebas Neue', Impact, 'Arial Narrow', sans-serif";
const sans = "'Inter', ui-sans-serif, system-ui, sans-serif";

export const doseClerkAppearance: Appearance = {
  variables: {
    colorPrimary: turquoiseDeep,
    colorBackground: white,
    colorText: ink,
    colorTextSecondary: mutedInk,
    colorInputBackground: white,
    colorInputText: ink,
    colorDanger: "#B3261E",
    colorSuccess: turquoiseDeep,
    colorNeutral: ink,
    fontFamily: sans,
    fontFamilyButtons: sans,
    borderRadius: "0.75rem",
    fontSize: "15px",
  },
  elements: {
    rootBox: { fontFamily: sans },
    card: {
      backgroundColor: white,
      border: `1px solid ${border}`,
      boxShadow:
        "0 24px 50px -20px rgba(17,29,29,0.35), 0 4px 12px -6px rgba(17,29,29,0.18)",
      color: ink,
    },
    headerTitle: {
      fontFamily: display,
      fontWeight: 400,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      fontSize: "2.1rem",
      lineHeight: 1,
      color: ink,
    },
    headerSubtitle: {
      color: mutedInk,
      fontFamily: sans,
    },
    socialButtonsBlockButton: {
      backgroundColor: silverLight,
      border: `1px solid ${border}`,
      color: ink,
      fontWeight: 500,
      "&:hover, &:focus": {
        backgroundColor: silver,
      },
    },
    socialButtonsBlockButtonText: {
      color: ink,
      fontWeight: 500,
    },
    dividerLine: { backgroundColor: border },
    dividerText: {
      color: mutedInk,
      textTransform: "uppercase",
      letterSpacing: "0.18em",
      fontSize: "0.7rem",
    },
    formFieldLabel: {
      color: ink,
      fontWeight: 600,
      fontSize: "0.72rem",
      letterSpacing: "0.12em",
      textTransform: "uppercase",
    },
    formFieldInput: {
      backgroundColor: white,
      border: `1px solid ${silver}`,
      color: ink,
      "&:focus": {
        borderColor: turquoise,
        boxShadow: `0 0 0 3px ${turquoise}40`,
      },
    },
    formButtonPrimary: {
      backgroundColor: pink,
      color: white,
      borderRadius: "9999px",
      fontFamily: sans,
      fontWeight: 700,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      fontSize: "0.72rem",
      "&:hover, &:focus, &:active": {
        backgroundColor: pinkDeep,
      },
    },
    footerActionText: { color: mutedInk },
    footerActionLink: {
      color: turquoiseDeep,
      fontWeight: 600,
      "&:hover": { color: pink },
    },
    identityPreview: {
      backgroundColor: silverLight,
      border: `1px solid ${border}`,
    },
    identityPreviewText: { color: ink },
    identityPreviewEditButton: { color: turquoiseDeep },
    formResendCodeLink: {
      color: turquoiseDeep,
      "&:hover": { color: pink },
    },
    otpCodeFieldInput: {
      borderColor: silver,
      color: ink,
      "&:focus": {
        borderColor: turquoise,
        boxShadow: `0 0 0 3px ${turquoise}40`,
      },
    },
    alert: {
      backgroundColor: silverLight,
      border: `1px solid ${border}`,
      color: ink,
    },
    badge: {
      backgroundColor: silverLight,
      color: ink,
    },
    userButtonPopoverCard: {
      backgroundColor: white,
      border: `1px solid ${border}`,
      color: ink,
    },
    userButtonPopoverActionButton: {
      color: ink,
      "&:hover": { backgroundColor: silverLight },
    },
    userButtonPopoverActionButtonText: { color: ink },
    userButtonPopoverFooter: { display: "none" },
  },
};
