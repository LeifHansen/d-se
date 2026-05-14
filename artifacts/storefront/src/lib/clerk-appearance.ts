import type { ClerkProviderProps } from "@clerk/clerk-react";

type Appearance = NonNullable<ClerkProviderProps["appearance"]>;

const teal = "#0F3933";
const tealDeep = "#0B2A26";
const cream = "#F1ECDC";
const ivory = "#F7F2E2";
const gold = "#C9A24C";
const goldHover = "#B8902F";
const border = "rgba(15, 57, 51, 0.14)";
const mutedInk = "rgba(15, 57, 51, 0.62)";
const display = "'Cormorant Garamond', Georgia, serif";
const sans = "'Inter', ui-sans-serif, system-ui, sans-serif";

export const doseClerkAppearance: Appearance = {
  variables: {
    colorPrimary: teal,
    colorBackground: ivory,
    colorText: teal,
    colorTextSecondary: mutedInk,
    colorInputBackground: "#FFFFFF",
    colorInputText: teal,
    colorDanger: "#A93C24",
    colorSuccess: "#3F6B5A",
    colorNeutral: teal,
    fontFamily: sans,
    fontFamilyButtons: sans,
    borderRadius: "0.5rem",
    fontSize: "15px",
  },
  elements: {
    rootBox: { fontFamily: sans },
    card: {
      backgroundColor: ivory,
      border: `1px solid ${border}`,
      boxShadow:
        "0 24px 50px -20px rgba(15,57,51,0.35), 0 4px 12px -6px rgba(15,57,51,0.18)",
      color: teal,
    },
    headerTitle: {
      fontFamily: display,
      fontWeight: 500,
      letterSpacing: "-0.01em",
      fontSize: "1.85rem",
      color: teal,
    },
    headerSubtitle: {
      color: mutedInk,
      fontFamily: sans,
    },
    socialButtonsBlockButton: {
      backgroundColor: cream,
      border: `1px solid ${border}`,
      color: teal,
      fontWeight: 500,
      "&:hover, &:focus": {
        backgroundColor: "#E8E1CC",
      },
    },
    socialButtonsBlockButtonText: {
      color: teal,
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
      color: teal,
      fontWeight: 500,
      fontSize: "0.78rem",
      letterSpacing: "0.04em",
      textTransform: "uppercase",
    },
    formFieldInput: {
      backgroundColor: "#FFFFFF",
      border: `1px solid ${border}`,
      color: teal,
      "&:focus": {
        borderColor: gold,
        boxShadow: `0 0 0 3px ${gold}33`,
      },
    },
    formButtonPrimary: {
      backgroundColor: teal,
      color: cream,
      fontFamily: sans,
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      fontSize: "0.78rem",
      "&:hover, &:focus, &:active": {
        backgroundColor: tealDeep,
      },
    },
    footerActionText: { color: mutedInk },
    footerActionLink: {
      color: teal,
      fontWeight: 600,
      "&:hover": { color: goldHover },
    },
    identityPreview: {
      backgroundColor: cream,
      border: `1px solid ${border}`,
    },
    identityPreviewText: { color: teal },
    identityPreviewEditButton: { color: goldHover },
    formResendCodeLink: {
      color: teal,
      "&:hover": { color: goldHover },
    },
    otpCodeFieldInput: {
      borderColor: border,
      color: teal,
      "&:focus": {
        borderColor: gold,
        boxShadow: `0 0 0 3px ${gold}33`,
      },
    },
    alert: {
      backgroundColor: cream,
      border: `1px solid ${border}`,
      color: teal,
    },
    badge: {
      backgroundColor: cream,
      color: teal,
    },
    userButtonPopoverCard: {
      backgroundColor: ivory,
      border: `1px solid ${border}`,
      color: teal,
    },
    userButtonPopoverActionButton: {
      color: teal,
      "&:hover": { backgroundColor: cream },
    },
    userButtonPopoverActionButtonText: { color: teal },
    userButtonPopoverFooter: { display: "none" },
  },
};
