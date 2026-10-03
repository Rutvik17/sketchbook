import type { Metadata, Viewport } from 'next';
import { Caveat } from 'next/font/google';
import { Cursor } from '@/components/Cursor';
import './globals.css';

/** The one hand: Caveat, the hand the film's captions are written in. */
const hand = Caveat({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-hand', display: 'swap' });

export const metadata: Metadata = {
  title: 'Sketchbook',
  description:
    "Places drawn in pencil and painted in watercolour. The first: Nvidia's Voyager and Endeavor in Santa Clara from the air, turned through a year of seasons, times of day and weather.",
};

export const viewport: Viewport = { themeColor: '#f5f0e6' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={hand.variable}>
      <body>
        <Cursor />
        <main>{children}</main>
      </body>
    </html>
  );
}
