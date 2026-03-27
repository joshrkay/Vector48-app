import { create } from "zustand";

export type Vertical =
  | "hvac"
  | "plumbing"
  | "electrical"
  | "roofing"
  | "landscaping";

export interface BusinessHours {
  preset: "weekday_8_5" | "weekday_7_6" | "all_week" | "custom";
  customHours?: Record<
    string,
    { open: string; close: string; closed: boolean }
  >;
}

export interface OnboardingState {
  accountId: string;
  currentStep: number;
  // Step data
  businessName: string;
  vertical: Vertical | "";
  phone: string;
  serviceArea: string;
  businessHours: BusinessHours;
  voiceGender: "male" | "female";
  voiceGreeting: string;
  notificationSms: boolean;
  notificationEmail: boolean;
  notificationContact: string;
  activateRecipe1: boolean;
}

interface OnboardingActions {
  setStepData: (data: Partial<OnboardingState>) => void;
  setCurrentStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
}

export type OnboardingStore = OnboardingState & OnboardingActions;

export const createOnboardingStore = (initial: Partial<OnboardingState>) =>
  create<OnboardingStore>((set) => ({
    accountId: "",
    currentStep: 0,
    businessName: "",
    vertical: "",
    phone: "",
    serviceArea: "",
    businessHours: { preset: "weekday_8_5" },
    voiceGender: "male",
    voiceGreeting: "",
    notificationSms: true,
    notificationEmail: false,
    notificationContact: "",
    activateRecipe1: true,
    ...initial,
    setStepData: (data) => set((s) => ({ ...s, ...data })),
    setCurrentStep: (step) => set({ currentStep: step }),
    nextStep: () => set((s) => ({ currentStep: s.currentStep + 1 })),
    prevStep: () => set((s) => ({ currentStep: Math.max(0, s.currentStep - 1) })),
  }));
