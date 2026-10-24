import { motion } from 'framer-motion'
import { ArrowUpRight, Github, Instagram, Linkedin } from 'lucide-react'
import { Logo } from '../components/Brand'

const DEV = {
  name: 'Somesh Sanjay Thakur',
  role: 'Full-Stack & AI Automation Dev',
  bio: 'Crafting reactive web apps and autonomous agents with Next.js, React, Tailwind and Python. Shipping at the UX + LLM intersection.',
  photo: 'https://github.com/Somesh-Thakur.png?size=400',
  links: [
    { label: 'GitHub', handle: 'Somesh-Thakur', href: 'https://github.com/Somesh-Thakur', icon: Github, tint: '#f4f4f5' },
    { label: 'LinkedIn', handle: 'somesh-thakur', href: 'https://www.linkedin.com/in/somesh-thakur-30r07/', icon: Linkedin, tint: '#4aa3ff' },
    { label: 'Instagram', handle: '@itz__somesh_thakur', href: 'https://www.instagram.com/itz__somesh_thakur/', icon: Instagram, tint: '#ff5fa2' },
  ],
}

const STACK = ['React', 'TypeScript', 'Vite', 'Framer Motion', 'Zustand', 'Supabase', 'Vercel', 'Canvas', 'Web Audio']

const rise = (i: number) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.08 * i, duration: 0.6, ease: [0.2, 0.8, 0.2, 1] as const },
})

/** Who made Spindle, and what it's built with. */
export function AboutPage() {
  return (
    <div className="page about-page">
      <section className="about-hero">
        <motion.div className="about-photo" {...rise(0)}>
          <img src={DEV.photo} alt={DEV.name} width={240} height={240} />
          <span className="about-photo-ring" aria-hidden="true" />
        </motion.div>
        <div className="about-intro">
          <motion.span className="about-kicker" {...rise(1)}>
            Made by
          </motion.span>
          <motion.h1 className="about-name" {...rise(2)}>
            {DEV.name}
          </motion.h1>
          <motion.p className="about-role" {...rise(3)}>
            {DEV.role}
          </motion.p>
          <motion.p className="about-bio" {...rise(4)}>
            {DEV.bio}
          </motion.p>
          <motion.div className="about-links" {...rise(5)}>
            {DEV.links.map(({ label, handle, href, icon: Icon, tint }) => (
              <a key={label} href={href} target="_blank" rel="noreferrer" className="about-link" style={{ ['--tint' as string]: tint }} data-cursor="open">
                <span className="about-link-icon">
                  <Icon size={20} />
                </span>
                <span className="about-link-text">
                  <b>{label}</b>
                  <small>{handle}</small>
                </span>
                <ArrowUpRight size={16} className="about-link-arrow" />
              </a>
            ))}
          </motion.div>
        </div>
      </section>

      <motion.section className="about-app" {...rise(6)}>
        <div className="about-app-head">
          <Logo size={44} />
          <div>
            <h2>About Spindle</h2>
            <p>A free music player with full songs, live lyrics, karaoke, story cards and your library on every device. Designed and built from scratch.</p>
          </div>
        </div>
        <div className="about-stack" aria-label="Built with">
          {STACK.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
        <p className="about-fine">
          Songs stream from YouTube, Apple’s iTunes previews and Audius; lyrics from LRCLIB. Spindle doesn’t host any music. <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> ·{' '}
          <a href="https://github.com/Somesh-Thakur/Spindle" target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
        </p>
      </motion.section>
    </div>
  )
}
