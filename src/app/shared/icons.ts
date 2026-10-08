import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Calendar,
  Check,
  ChevronDown,
  CircleSlash,
  Download,
  ExternalLink,
  Eye,
  HardDrive,
  Link,
  Mail,
  MailCheck,
  MapPin,
  MessageSquare,
  Pause,
  Play,
  Plus,
  QrCode,
  Search,
  Send,
  X,
} from 'lucide';
import type { IconNode } from 'lucide';

/**
 * The exact 23 icons the prototype uses, pulled from `lucide` as plain
 * data (`lucide` ships no Angular peer dependency, unlike
 * `lucide-angular`, which is pinned to Angular 13-21).
 *
 * A literal map keeps the bundle to 23 icons instead of the 2123-icon
 * barrel.
 */
export const PASE_ICONS = {
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  badgeCheck: BadgeCheck,
  calendar: Calendar,
  check: Check,
  chevronDown: ChevronDown,
  circleSlash: CircleSlash,
  download: Download,
  externalLink: ExternalLink,
  eye: Eye,
  hardDrive: HardDrive,
  link: Link,
  mail: Mail,
  mailCheck: MailCheck,
  mapPin: MapPin,
  messageSquare: MessageSquare,
  pause: Pause,
  play: Play,
  plus: Plus,
  qrCode: QrCode,
  search: Search,
  send: Send,
  x: X,
} as const satisfies Record<string, IconNode>;

export type PaseIconName = keyof typeof PASE_ICONS;
