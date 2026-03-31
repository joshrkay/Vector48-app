import type { LucideIcon } from "lucide-react";
import {
  Phone,
  MessageSquare,
  FileText,
  Moon,
  Mail,
  ClipboardCheck,
  RefreshCw,
  CalendarCheck,
  CalendarClock,
  Receipt,
  HeartHandshake,
  Wrench,
  Star,
  Megaphone,
  Sparkles,
  Zap,
  Sun,
  Bell,
  Truck,
  TrendingUp,
  Repeat,
  UserPlus,
  CloudLightning,
} from "lucide-react";

export const RECIPE_ICON_MAP: Record<string, LucideIcon> = {
  phone: Phone,
  "message-square": MessageSquare,
  "file-text": FileText,
  moon: Moon,
  mail: Mail,
  "clipboard-check": ClipboardCheck,
  "refresh-cw": RefreshCw,
  "calendar-check": CalendarCheck,
  "calendar-clock": CalendarClock,
  receipt: Receipt,
  "heart-handshake": HeartHandshake,
  wrench: Wrench,
  star: Star,
  megaphone: Megaphone,
  zap: Zap,
  sun: Sun,
  bell: Bell,
  truck: Truck,
  "trending-up": TrendingUp,
  repeat: Repeat,
  "user-plus": UserPlus,
  "cloud-lightning": CloudLightning,
};

/** Catalog icons may be PascalCase (e.g. MessageSquare) → kebab-case key */
export function iconKeyFromCatalog(icon: string): string {
  return icon
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

export function getRecipeLucideIcon(icon: string): LucideIcon {
  return RECIPE_ICON_MAP[iconKeyFromCatalog(icon)] ?? Sparkles;
}
