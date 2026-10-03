'use client';

/**
 * THE SKETCHBOOK'S FILM.
 *
 * A full-screen watercolour of Nvidia's campus in Santa Clara, drawn in
 * pencil, painted, and carried through a year of seasons and weather — the
 * engine is `src/lib/film`, the shots are `src/content/film.ts`. This is the
 * frame round it: one line written in the corner, the shots along the bottom
 * to jump between, and a pause.
 *
 * The line says what the hand is doing while the painting is made
 * ("sketching", "painting"), then, once it is done, what it is a painting of —
 * "Nvidia, Santa Clara", with a heart painted beside it in Nvidia's green.
 * Each line is written in as the one before it lifts off the paper.
 *
 * ---
 *
 * WITHOUT THE SCRIPT
 *
 * The canvas is empty and the painting's title is still written in the
 * corner. Nothing is hidden by CSS.
 *
 * REDUCED MOTION
 *
 * No pencil, no brush, no timelapse: the painting is there finished, still,
 * and every shot is a button — the same year, turned by hand.
 *
 */

import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '@/lib/gsap';
import { film as copy, shots } from '@/content/film';
import { createFilm, type Film as Engine } from '@/lib/film/film';
import { PaintedHeart } from './PaintedHeart';
import styles from './Film.module.css';

export function Film() {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const strip = useRef<HTMLOListElement>(null);
  const engine = useRef<Engine | null>(null);
  const [caption, setCaption] = useState('');
  const [index, setIndex] = useState(-1);
  const [dark, setDark] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [still, setStill] = useState(false);
  // The line in the corner: the act while the painting is made, then the place. Before the film has
  // said anything (and without the script) it is the place.
  const line = index === -1 && caption ? caption : copy.title;
  const [lines, setLines] = useState<{ now: string; was: string | null }>({ now: copy.title, was: null });
  useEffect(() => {
    setLines((l) => (l.now === line ? l : { now: line, was: l.now }));
  }, [line]);

  useEffect(() => {
    const el = canvas.current;
    const section = root.current;
    if (!el || !section) return;
    const reduced = prefersReducedMotion();
    setStill(reduced);
    const film = createFilm(el, {
      reduced,
      hooks: {
        onCaption(text, i) {
          setCaption(text);
          setIndex(i);
        },
        onDark: setDark,
        onProgress(f) {
          strip.current?.style.setProperty('--p', f.toFixed(4));
        },
      },
    });
    engine.current = film;
    // Nothing covers the page here, so the hand starts at once.
    film.begin();
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __film?: Engine }).__film = film;

    // Only paint while someone can see it.
    const io = new IntersectionObserver(([e]) => film.setVisible(e.isIntersecting && !document.hidden), { threshold: 0.01 });
    io.observe(section);
    const onVis = () => film.setVisible(!document.hidden && section.getBoundingClientRect().bottom > 0);
    document.addEventListener('visibilitychange', onVis);
    let pending = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => film.resize());
    });
    ro.observe(el);

    return () => {
      io.disconnect();
      ro.disconnect();
      cancelAnimationFrame(pending);
      document.removeEventListener('visibilitychange', onVis);
      film.destroy();
      engine.current = null;
    };
  }, []);

  const toggle = () => {
    const next = !playing;
    setPlaying(next);
    engine.current?.setPlaying(next);
  };

  return (
    <section ref={root} className={styles.film} data-film aria-label={copy.description} data-film-dark={dark ? '' : undefined}>
      <canvas ref={canvas} className={styles.canvas} role="img" aria-label={caption ? `${copy.title} — ${caption}` : copy.title} />

      <div className={styles.plate}>
        <p className={styles.caption} aria-live="polite">
          {lines.was && (
            <span key={`was-${lines.was}`} className={`${styles.line} ${styles.leaving}`} aria-hidden="true">
              <span className={styles.captionText}>{lines.was}</span>
              {lines.was === copy.title && <span className={styles.heartRoom} />}
            </span>
          )}
          <span key={lines.now} className={styles.line}>
            <span className={styles.captionText}>{lines.now}</span>
            {lines.now === copy.title && <PaintedHeart className={styles.heart} />}
          </span>
        </p>
      </div>

      <div className={styles.controls}>
        <ol ref={strip} className={styles.strip} aria-label="Shots">
          {shots.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                className={styles.shot}
                aria-pressed={i === index}
                onClick={() => {
                  engine.current?.goTo(i);
                  if (still) {
                    setIndex(i);
                    setCaption(s.label);
                  }
                }}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ol>
        {!still && (
          <button type="button" className={styles.pause} onClick={toggle} aria-pressed={!playing}>
            {playing ? 'pause' : 'play'}
          </button>
        )}
      </div>
    </section>
  );
}
