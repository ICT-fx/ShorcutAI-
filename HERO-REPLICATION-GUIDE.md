# Guide de réplication — Hero + Design system (Shortcut)

> Destiné à un **autre Claude Code** qui doit recréer **exactement** la hero section de ce site (et, plus largement, son look & feel) sur un autre projet.
> Tout ce qui est ci-dessous est extrait du code réel. Suis-le à la lettre.

---

## 0. Stack à reproduire

| Brique | Choix |
|---|---|
| Build | **Vite + React 18** (JSX, pas de TypeScript) |
| Animations | **framer-motion** (entrées, scroll, ressorts) |
| CSS | **Tailwind v3** + styles inline (`style={{…}}`) mélangés |
| Icônes | **lucide-react** |
| Polices | Google Fonts (voir §2) |

```bash
npm i react react-dom framer-motion lucide-react
npm i -D tailwindcss@3 postcss autoprefixer vite @vitejs/plugin-react
```

Tailwind `content`: `['./index.html', './src/**/*.{js,jsx}']`.

---

## 1. LA HERO — ce qu'il faut savoir d'abord

⚠️ **Piège** : le fichier `src/components/ui/minimalist-hero.jsx` existe mais **n'est PAS utilisé**. C'est une hero blanche alternative, morte. La **vraie** hero est le composant `Hero()` défini **inline dans `src/App.jsx`** (~ligne 555). Réplique celle-là.

### Anatomie de la vraie hero

Fond **sombre `#07070F`** plein écran, avec 4 couches superposées :

1. **Fond dynamique “ambient glow”** — un `<div ref={heroRef}>` dont le `background` (gradient) est recalculé en JS à partir des **couleurs moyennes de la vidéo** qui joue plus bas. Effet « la pièce prend la couleur de l'écran ».
2. **2 blobs radiaux floutés** (positionnés en absolu, `filter: blur(70–80px)`), couleur = accent.
3. **Nav** (logo `shortcut.` + toggle de mode + liens + CTA).
4. **Bloc texte** (h1 + paragraphe + boutons + trust signals).
5. **“Tablette vidéo”** : une carte 3D qui se redresse au scroll (`ContainerScroll`) contenant une `<video autoPlay muted loop>`.

### 1.a — Le conteneur racine

```jsx
<div
  id="hero"
  ref={heroRef}
  className="relative w-full overflow-hidden"
  style={{ background: '#07070F', transition: 'background 0.6s ease' }}
>
```

### 1.b — Les blobs de couleur (sous tout le reste, z-0)

```jsx
<div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
  <div style={{ position:'absolute', top:'-10%', left:'15%', width:'500px', height:'400px',
    background:'radial-gradient(ellipse, rgba(104,69,236,0.18) 0%, transparent 70%)',
    filter:'blur(70px)', borderRadius:'50%', transition:'background 0.5s ease' }} />
  <div style={{ position:'absolute', top:'2%', right:'10%', width:'400px', height:'320px',
    background:'radial-gradient(ellipse, rgba(99,179,237,0.14) 0%, transparent 70%)',
    filter:'blur(80px)', borderRadius:'50%' }} />
</div>
```

### 1.c — Le fond dynamique qui échantillonne la vidéo (l'effet signature)

Logique React, dans un `useEffect`. Idée : un `<canvas>` 16×16 invisible, on y dessine une frame de la vidéo toutes les 200 ms, on moyenne les pixels, puis on lerp (interpolation douce) vers cette couleur et on l'injecte dans un gradient de fond. Un `IntersectionObserver` met tout en pause hors écran.

```jsx
const heroRef   = useRef(null)
const videoRef  = useRef(null)
const targetRef  = useRef({ r: 7, g: 7, b: 15 })
const currentRef = useRef({ r: 7, g: 7, b: 15 })
const isVisible  = useRef(false)

useEffect(() => {
  const canvas = document.createElement('canvas')
  canvas.width = 16; canvas.height = 16
  const ctx = canvas.getContext('2d')
  let rafId, sampleTid, frameCount = 0

  // gradient : noir en haut -> couleur saturée de la vidéo en bas
  function computeGradient(r, g, b) {
    const avg = (r + g + b) / 3, factor = 2.8
    const clamp = v => Math.min(255, Math.max(0, Math.round(avg + (v - avg) * factor)))
    const br = clamp(r), bg = clamp(g), bb = clamp(b)
    const mix = c => Math.round(c + (255 - c) * 0.45)
    return `linear-gradient(to bottom, #07070F 0%, #07070F 50%, rgba(${br},${bg},${bb},0.9) 75%, rgb(${mix(br)},${mix(bg)},${mix(bb)}) 100%)`
  }

  function sample() {
    const v = videoRef.current
    if (v && v.readyState >= 2 && isVisible.current) {
      try {
        ctx.drawImage(v, 0, 0, 16, 16)
        const d = ctx.getImageData(0, 0, 16, 16).data
        let r=0,g=0,b=0
        for (let i=0;i<d.length;i+=4){ r+=d[i]; g+=d[i+1]; b+=d[i+2] }
        const n = d.length/4
        targetRef.current = { r:r/n, g:g/n, b:b/n }
      } catch(_) {}
    }
    sampleTid = setTimeout(sample, 200)
  }

  const lerp = (a,b,t) => a + (b-a)*t
  function tick() {
    if (!isVisible.current) { rafId = null; return }
    const c = currentRef.current, t = targetRef.current
    const next = { r:lerp(c.r,t.r,0.04), g:lerp(c.g,t.g,0.04), b:lerp(c.b,t.b,0.04) }
    currentRef.current = next
    if (++frameCount % 3 === 0 && heroRef.current)
      heroRef.current.style.background = computeGradient(next.r, next.g, next.b)
    rafId = requestAnimationFrame(tick)
  }

  const observer = new IntersectionObserver(([e]) => {
    isVisible.current = e.isIntersecting
    const v = videoRef.current
    if (e.isIntersecting) { v?.play().catch(()=>{}); if(!rafId) rafId = requestAnimationFrame(tick) }
    else v?.pause()
  }, { threshold: 0.1 })
  if (heroRef.current) observer.observe(heroRef.current)

  const v = videoRef.current
  if (v) {
    v.addEventListener('canplay', () => { sample(); rafId = requestAnimationFrame(tick) }, { once:true })
    if (v.readyState >= 2) { sample(); rafId = requestAnimationFrame(tick) }
  }
  return () => { clearTimeout(sampleTid); cancelAnimationFrame(rafId); observer.disconnect() }
}, [])
```

> ⚠️ La vidéo **doit** être servie avec `crossOrigin="anonymous"` ET un CORS qui l'autorise, sinon `getImageData` lève une *tainted canvas* et l'effet est silencieusement ignoré (le `try/catch` l'avale).

### 1.d — La nav

- `max-w-7xl mx-auto px-6 pt-8`, `flex … justify-between`, `z-30`.
- **Logo** : texte `shortcut` + `<span style={{ color: accent }}>.</span>` (le point prend la couleur d'accent).
- Liens : `text-sm font-medium tracking-widest`, couleur `rgba(255,255,255,0.45)` → blanc au hover.
- **CTA** plein : pilule `rounded-full px-5 py-2`, `background: accent`, `boxShadow: 0 4px 20px ${accent}40`.
- Toutes les entrées sont animées avec framer-motion : `initial={{ opacity:0, x:-20 }} animate={{ opacity:1, x:0 }} transition={{ duration:0.5 }}` (variantes ±x / -y selon la position).

### 1.e — Le bloc texte

```jsx
<div className="max-w-6xl mx-auto px-6 pt-20 pb-0">
  <motion.div key={mode} initial={{opacity:0,y:24}} animate={{opacity:1,y:0}} transition={{duration:0.5}}>
    <h1 className="font-black leading-[1.02] tracking-tight mb-5"
        style={{ fontFamily:'Inter, sans-serif', fontWeight:800,
                 fontSize:'clamp(2.8rem, 5.5vw, 5rem)', color:'#FFFFFF', letterSpacing:'-0.05em' }}>
      We turn your property into an<br/> <span style={{ color: accent }}>irresistible</span> place.
    </h1>
    <p className="text-lg md:text-xl leading-relaxed mb-7"
       style={{ color:'rgba(255,255,255,0.55)', maxWidth:'680px', letterSpacing:'-0.03em' }}>
      … <strong style={{ color:'#fff', fontWeight:600 }}>delivered in 48 hours.</strong>
    </p>
    {/* boutons + trust signals */}
  </motion.div>
</div>
```

- **H1** : `Inter` 800, `clamp(2.8rem, 5.5vw, 5rem)`, `letterSpacing: -0.05em`, blanc avec **un mot en couleur d'accent**.
- **Paragraphe** : blanc à 55 % d'opacité, `max-width 680px`, `letterSpacing: -0.03em`, mots-clés en `#fff` gras.
- **Boutons** : CTA primaire `rounded-xl px-7 py-3.5`, `background: accent`, `boxShadow: 0 4px 20px ${accent}50` ; CTA secondaire blanc texte `#0D0D0D`.
- **Trust signals** sur la même ligne : séparateurs `h-5 w-px` à `rgba(255,255,255,0.15)`, une icône lucide colorée + un chiffre en gras, et un petit **drapeau FR en SVG** « Registered in France ».

### 1.f — La tablette vidéo (`ContainerScroll`)

Composant à part : `src/components/ui/container-scroll-animation.jsx`. Au scroll il redresse une carte (rotateX 20°→0°), la scale (0.92→1) et la translate, le tout lissé par `useSpring`.

```jsx
import { useRef, useState, useEffect } from 'react'
import { useScroll, useTransform, useSpring, motion } from 'framer-motion'

export function ContainerScroll({ titleComponent, children }) {
  const containerRef = useRef(null)
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start end', 'start 0.1'] })
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const rotate     = useSpring(useTransform(scrollYProgress,[0,1],[20,0]),               { stiffness:60, damping:20 })
  const scale      = useSpring(useTransform(scrollYProgress,[0,1], isMobile?[0.85,1]:[0.92,1]), { stiffness:60, damping:20 })
  const translateY = useSpring(useTransform(scrollYProgress,[0,1],[60,0]),               { stiffness:60, damping:20 })

  return (
    <div ref={containerRef} className="h-[55rem] md:h-[62rem] flex items-start justify-center relative px-2 md:px-20">
      <div className="pt-24 w-full relative" style={{ perspective:'1000px' }}>
        <motion.div style={{ translateY }} className="max-w-5xl mx-auto text-center mb-0">{titleComponent}</motion.div>
        <motion.div
          style={{ rotateX: rotate, scale,
            boxShadow:'0 0 #0000004d, 0 9px 20px #0000004a, 0 37px 37px #00000042, 0 84px 50px #00000026, 0 149px 60px #0000000a, 0 233px 65px #00000003' }}
          className="max-w-6xl mx-auto h-[34rem] md:h-[48rem] w-full border-4 border-[#6C6C6C] p-2 md:p-4 bg-[#111111] rounded-[30px] shadow-2xl">
          <div className="h-full w-full overflow-hidden rounded-2xl bg-black">{children}</div>
        </motion.div>
      </div>
    </div>
  )
}
```

Usage dans la hero :

```jsx
<ContainerScroll titleComponent={null}>
  <video ref={videoRef}
    src="https://…/presentation.mp4"
    autoPlay muted loop playsInline crossOrigin="anonymous"
    className="w-full h-full object-cover" />
</ContainerScroll>
```

### 1.g — Le “dual mode” (preview ↔ video)

La hero reçoit `mode` (`'preview'` | `'video'`) et `accent`. Le mode pilote :
- l'**accent** : `#03A63C` (vert, preview) vs `#6845EC` (violet, video) ;
- quel **h1 / paragraphe / CTA** afficher ;
- la couleur du **blob** principal.

Le `key={mode}` sur le `motion.div` force le re-jeu de l'animation d'entrée au switch. Si ton nouveau site n'a qu'un seul mode, supprime toute la branche conditionnelle et code `accent` en dur.

---

## 2. POLICES

Chargées via Google Fonts dans `index.html` :

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@700;800;900&family=Syne:wght@400;500;600;700;800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap" rel="stylesheet">
```

| Rôle | Police | Où |
|---|---|---|
| **Body / défaut** | **DM Sans** | `body`, nav, paragraphes, boutons |
| **Titre hero (H1)** | **Inter** 800 | uniquement le H1 de la hero |
| **Titres de section (H2)** | **Syne** | classe `font-heading` |
| **Gros display** | **Bebas Neue** | classe `font-display` |

Mapping Tailwind (`tailwind.config.js`) :

```js
fontFamily: {
  display: ['"Bebas Neue"', 'sans-serif'],
  heading: ['Syne', 'sans-serif'],
  sans:    ['"DM Sans"', 'sans-serif'],
}
```

### Règle typographique NON négociable : letter-spacing négatif

Look premium. Toujours en inline `style={{ letterSpacing: '…em' }}`, **jamais** `tracking-*` Tailwind (pas assez fin).

| Élément | `letterSpacing` |
|---|---|
| H1 hero | `-0.05em` |
| H2 sections (`font-display`) | `-0.04em` |
| Gros paragraphes (≥ 1.8rem) | `-0.05em` |
| Heading géant FinalCTA (clamp ≥ 3rem) | `-0.05em` |
| Body moyen (paragraphe hero, sous-titres) | `-0.03em` |
| Listes à puces / phrases courtes (≤ text-xl) | `-0.05em` |
| Boutons / CTA | `-0.03em` |

---

## 3. COULEURS

Variables `:root` (dans `index.css`) — mais **la plupart du code utilise les hex en dur** :

```css
:root {
  --bg:     #FFFFFF;
  --violet: #6845EC;   /* accent SaaS / mode video */
  --navy:   #2D4077;   /* contraste rare */
  --warm:   #F2EAE4;   /* highlight chaud */
  --amber:  #F59E0B;
  --green:  #22C55E;
}
```

| Usage | Couleur |
|---|---|
| Fond hero (sombre) | `#07070F` |
| Fond pages claires | `#FFFFFF` / `#FAFAFA` |
| Texte principal | `#111827` |
| **Accent video** (violet) | `#6845EC` |
| **Accent preview** (vert) | `#03A63C` |
| Contraste rare (navy) | `#2D4077` |
| Highlight chaud | `#F2EAE4` |
| Texte sur fond sombre | `#fff` ; secondaire `rgba(255,255,255,0.55)` ; tertiaire `0.45` |

> Convention : sur fond sombre, hiérarchise par **opacité du blanc** (1 / 0.55 / 0.45 / 0.15) plutôt que par gris distincts.

### Détails CSS d'ambiance (dans `index.css`)
- **Grain** : overlay `body::after` plein écran, SVG `feTurbulence`, `opacity: 0.018`, `z-index: 9999`, `pointer-events: none`.
- **Scrollbar** fine 3px, pouce `rgba(104,69,236,0.35)`.
- **Sélection** : `background: rgba(104,69,236,0.15)`.
- Utilitaires : `.btn-primary` (pilule violette + ombre), `.btn-secondary` (bordure), `.section-label` (label uppercase avec tiret avant), `.gradient-text`, `.accent-gradient-text`, `.card-glow`, `.grid-bg`.

---

## 4. ANIMATIONS

### Tailwind keyframes (`tailwind.config.js`)
```js
animation: {
  marquee: 'marquee 35s linear infinite',
  float: 'float 5s ease-in-out infinite',
  'float-delayed': 'float 5s ease-in-out infinite 2.5s',
  'glow-pulse': 'glowPulse 3s ease-in-out infinite',
}
// keyframes: marquee (translateX 0 -> -33.333%), float (translateY 0 -> -14px),
//            glowPulse (opacity 0.5 -> 1)
```

### Pattern framer-motion réutilisé partout
- **Entrée** : `initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.6 }}`, avec des `delay` en cascade.
- **Reveal au scroll** : hook `useInView` (IntersectionObserver, threshold 0.12) + wrapper `<FadeIn>` — défini en haut de `App.jsx`. À recopier tel quel.
- Easing signature pour les éléments « héro » : `ease: [0.22, 1, 0.36, 1]`.

---

## 5. STRUCTURE GÉNÉRALE DU SITE

**Tout le landing tient dans un seul fichier `src/App.jsx`** : chaque section est un composant fonction nommé, rendu en séquence par le `export default function App()`. Ne pas éclater en fichiers séparés (convention du projet).

Ordre de rendu réel (`App` → JSX) :

```
<LoadingScreen/>      // écran de chargement animé (mode-aware)
<AuthOverlay/>        // modale auth (overlay)
<BookingOverlay/>     // iframe Cal.com (overlay)
<Hero/>               // ← la hero documentée ci-dessus
<Targets/>            // "ce qu'on croit" + grille de bullets 2 colonnes
<Services/>
<Viewer3DSection/>    // (mode preview only) visionneuse .glb @react-three/fiber
<WidgetSection/>      // (mode preview only)
<TestimonialBanner/>
<ValueProps/>
<ShowcaseGallery/>    // galerie / carousel
<Portfolio/>
<HowItWorks/>         // étapes avec StepVisual1/2/...
<TestimonialBannerJulie/>
<Testimonials/>       // colonnes qui défilent
<Pricing/>            // PLANS vs PREVIEW_PLANS selon le mode
<OrderIntake/>        // modale de commande (overlay)
<TrustBar/>
<FinalCTA/>           // heading géant
<Footer/>
```

Props partagées : `{ mode, accent }` (objet `shared`) passé à quasi toutes les sections. Le mode bascule l'accent (`#03A63C` ⇄ `#6845EC`) et le jeu de plans/pricing.

### Conventions à respecter pour rester cohérent
- **Styles inline** dominants dans `src/pages/**` ; le landing (`App.jsx`) mélange Tailwind + inline. Ne pas refactorer l'un en l'autre — copier le pattern du voisin.
- **Pas de design system abstrait** : pas de `<Button>`/`<Card>` partagés. On copie-colle les motifs inline.
- Sections claires sur fond blanc, séparées par du `padding` vertical généreux (`pt-28`, etc.), titres en `Syne` / `Bebas Neue` avec letter-spacing négatif.
- Icônes : **lucide-react** exclusivement (`ArrowRight`, `Building2`, `Users`, …).

---

## 6. Checklist de réplication de la hero

1. [ ] Charger DM Sans + Inter + Syne + Bebas Neue dans `index.html`.
2. [ ] Config Tailwind : `fontFamily` + animations ci-dessus.
3. [ ] `index.css` : grain overlay, scrollbar, sélection, `:root` couleurs.
4. [ ] Recréer `ContainerScroll` (fichier §1.f).
5. [ ] Composant `Hero` : conteneur `#07070F`, blobs, `useEffect` d'échantillonnage vidéo, nav, bloc texte (Inter 800, `-0.05em`), CTA pilule à l'accent, trust signals, `<ContainerScroll><video crossOrigin="anonymous"/></ContainerScroll>`.
6. [ ] Vérifier le CORS de la vidéo (sinon l'ambient glow ne marche pas).
7. [ ] Si mono-mode : retirer la logique `mode`, figer `accent`.
8. [ ] `npm run build` pour valider (sert de typecheck — pas de TS, pas de tests).
```
