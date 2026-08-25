import {
  Utensils, ShoppingBag, Receipt, Bus, Carrot, Cherry, Cookie, Dumbbell, Mic, Phone, Shirt, Sparkles,
  Home, Sofa, Baby, User, MessageCircle, Plane, Wine, Cpu, Car, Cross, Book, GraduationCap, Dog,
  Wallet, Gift, Briefcase, Hammer, HeartHandshake, Ticket, Users, Award, TrendingUp, Coins, Circle,
  type LucideIcon,
} from 'lucide-react';
import { createElement } from 'react';

export const ICONS: Record<string, LucideIcon> = {
  Utensils, ShoppingBag, Receipt, Bus, Carrot, Cherry, Cookie, Dumbbell, Mic, Phone, Shirt, Sparkles,
  Home, Sofa, Baby, User, MessageCircle, Plane, Wine, Cpu, Car, Cross, Book, GraduationCap, Dog,
  Wallet, Gift, Briefcase, Hammer, HeartHandshake, Ticket, Users, Award, TrendingUp, Coins,
};

export const ICON_CHOICES = Object.keys(ICONS);

export function CatIcon({ name, className }: { name: string; className?: string }) {
  const C = ICONS[name] ?? Circle;
  return createElement(C, { className, strokeWidth: 1.8 });
}
