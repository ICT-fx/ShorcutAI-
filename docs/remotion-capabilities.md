# Catalogue des capacités Remotion — la « carte du territoire »

Tout ce que Remotion sait faire, organisé par package. Source : doc officielle
(remotion.dev, v4.0.x). Remotion = React → vidéo : au fond **tout ce qui est
faisable en React/CSS/SVG/Canvas/WebGL** est rendable. Les packages ci-dessous
sont les *briques toutes faites* qui évitent de réinventer la roue.

Légende d'install : ✅ déjà installé · ⬜ à installer · ⚙️ dépendance native/lourde.

> **MàJ install (2026-05-31)** : TOUS les packages ⬜ ci-dessous ont été
> installés (épinglés en `4.0.469`), + les peers `three`, `@react-three/fiber`,
> `@types/three`. **Seule exception : `@remotion/zod-types`** — il exige zod v4
> alors que le projet est en zod v3 (l'installer forcerait une migration
> cassante). À reconsidérer si on migre zod un jour.

---

## 0. Noyau — `remotion` ✅

Les primitives présentes dans **chaque** composition :

- **Structure** : `<Composition>`, `<Sequence>`, `<Series>`, `<AbsoluteFill>`, `<Freeze>`, `<Loop>`.
- **Temps** : `useCurrentFrame()`, `useVideoConfig()`.
- **Animation** : `interpolate()`, `spring()`, `Easing` (bezier, cubic, elastic…), `interpolateColors()`, `measureSpring()`.
- **Média** : `<Img>`, `<Video>`, `<OffthreadVideo>`, `<Audio>`, `<IFrame>`.
- **Divers** : `staticFile()`, `random()` (déterministe, indispensable pour un rendu stable), `delayRender()/continueRender()` (attendre des données), `cancelRender()`.
- **Data-driven** : `defaultProps`, input props, `calculateMetadata()` (durée/dimensions dynamiques selon les props).

➡️ **Suffit déjà pour** : tout le montage de base (clips, fondus, mouvements, textes animés). C'est ce que ton pipeline utilise aujourd'hui.

---

## 1. Transitions — `@remotion/transitions` ⬜

`<TransitionSeries>` avec des *présentations* et des *timings*.

- **Présentations** : `fade`, `slide`, `wipe`, `flip`, `clockWipe`, `none` — **+ présentations custom** (on peut écrire les nôtres).
- **Timings** : `springTiming({config})`, `linearTiming({durationInFrames})`.

➡️ **Outils possibles** : transitions premium (whip via slide+blur, flip 3D, balayage horloge), bien au-delà des 6 transitions « maison » actuelles.

---

## 2. Formes vectorielles — `@remotion/shapes` ⬜

Composants + générateurs de paths SVG : `Rect`, `Circle`, `Ellipse`, `Triangle`, `Star`, `Polygon`, `Pie`, `Heart` (et `makeRect`, `makeCircle`, `makePie`…).

➡️ **Outils possibles** : cadres/corner-brackets animés, jauges en anneau (`Pie`), badges, grille blueprint, formes décoratives.

---

## 3. Chemins SVG — `@remotion/paths` ⬜ ⭐ (clé pour la carte+avion)

Boîte à outils pour animer le long d'un tracé : `getLength`, `getPointAtLength`, `getTangentAtLength`, `evolvePath` (effet « dessin qui se trace »), `interpolatePath`, `warpPath`, `translatePath`, `scalePath`, `reversePath`.

➡️ **Outils possibles** : **avion qui suit un arc entre deux pays**, ligne de trajet qui se dessine, signature animée, graphiques traçés.

---

## 4. Flou de mouvement — `@remotion/motion-blur` ⬜

`<Trail>` (traînée) et `<CameraMotionBlur>` (flou caméra).

➡️ **Outils possibles** : speed-ramps, whip-pans cinématiques, mouvements « beurre ».

---

## 5. Bruit procédural — `@remotion/noise` ⬜

`noise2D/3D/4D` (Perlin) — mouvement organique, déterministe.

➡️ **Outils possibles** : shake caméra naturel, flottements, particules, grain animé, distorsions douces.

---

## 6. Styles animés — `@remotion/animation-utils` ⬜

`interpolateStyles()` (animer un **objet de style CSS** entier entre keyframes) et `makeTransform()` (`translate`, `rotate`, `scale`, `skew`… composés proprement).

➡️ **Outils possibles** : presets d'animation de texte réutilisables (mask reveal, word-by-word, slide+fade) sans réécrire la logique à chaque fois.

---

## 7. Typographie mesurée — `@remotion/layout-utils` ⬜

`measureText()`, `fitText()`, `fillTextBox()` — mesurer et **adapter** le texte à un encart.

➡️ **Outils possibles** : titres qui s'ajustent toujours sans déborder, lower-thirds responsives, mise en page propre garantie.

---

## 8. Audio & dataviz — `@remotion/media-utils` ⬜

`getAudioData()`, `visualizeAudio()`, `useAudioData()`, `getVideoMetadata()`, `getImageDimensions()`.

➡️ **Outils possibles** : **waveform/spectre audio animé** (calé sur la musique), beat-detection visuel, vignettes vidéo.

---

## 9. Sous-titres — `@remotion/captions` ⬜

Type `Caption` standard, `parseSrt`, `serializeSrt`, `createTikTokStyleCaptions()` (regroupe les mots en « pages » façon TikTok).

➡️ **Outils possibles** : sous-titres karaoké mot-à-mot, styles de captions avancés (tu as déjà du custom, ceci le standardise).

---

## 10. Lottie — `@remotion/lottie` ⬜

Rendre des animations **Lottie** (exports After Effects via Bodymovin).

➡️ **Outils possibles** : icônes animées pro, illustrations complexes toutes faites (énormes bibliothèques gratuites type LottieFiles).

---

## 11. GIF — `@remotion/gif` ⬜

`<Gif>` : intégrer des GIFs animés (et rendu calé sur la frame).

➡️ **Outils possibles** : stickers, memes, réactions.

---

## 12. Polices — `@remotion/google-fonts` ✅ · `@remotion/fonts` ⬜

Charger n'importe quelle **Google Font** typée (déjà utilisé), ou des polices locales/custom (`@remotion/fonts`).

➡️ Typographie premium illimitée.

---

## 13. 3D — `@remotion/three` ⬜ ⚙️

Three.js / React-Three-Fiber dans Remotion (`<ThreeCanvas>`).

➡️ **Outils possibles** : globe 3D, objets produits qui tournent, scènes 3D. *(Lourd : tire three.js.)*

---

## 14. Graphismes haute perf — `@remotion/skia` ⬜ ⚙️

React-Native-Skia : shaders, blurs, dégradés, masques GPU.

➡️ **Outils possibles** : color grading par shader, light leaks, effets de glow avancés, film grain GPU. *(Setup natif plus lourd.)*

---

## 15. Autres packages utiles

- `@remotion/rive` ⬜ — animations **Rive** (interactives/légères).
- `@remotion/animated-emoji` ⬜ — emoji animés Apple/Google.
- `@remotion/zod-types` ⬜ — `zodColor`, `zodMatrix` : props typées éditables visuellement dans Studio.
- `@remotion/media-parser` ✅ — parser les métadonnées de n'importe quel fichier média.
- `@remotion/openai-whisper` / `@remotion/install-whisper-cpp` ⬜ — transcription → captions (tu utilises déjà Groq Whisper côté serveur).
- `@remotion/tailwind-v4` ⬜ — TailwindCSS dans les compositions.
- `@remotion/preload` ⬜ — précharger média/fonts pour un rendu fluide.

## 16. Rendu (capacités de sortie)

- Codecs : **H.264, H.265/HEVC, VP8, VP9, ProRes, GIF**, audio-only (mp3/aac/wav), image sequence, still (png/jpeg/webp).
- **Transparence (canal alpha)** en ProRes/WebM.
- Concurrence, qualité/CRF, plage de frames, embedding de chapitres.
- Cloud : `@remotion/lambda` ⬜, `@remotion/cloudrun` ⬜ (rendu à l'échelle).

---

## Ce que ça veut dire pour la bibliothèque d'outils

Chaque entrée ⬜ ci-dessus = un ou plusieurs **outils** potentiels dans
`src/lib/edl/tools/`. Le framework tool-aware en place fait que, dès qu'un outil
est construit (et son package installé), **l'IA le connaît automatiquement**.

Priorité « impact / effort » pour un éditeur cash-cow :
1. `@remotion/transitions` — transitions pro (gros impact, faible effort)
2. `@remotion/paths` + `@remotion/shapes` — **carte+avion**, cadres, jauges
3. `@remotion/layout-utils` — titres/lower-thirds qui s'ajustent
4. `@remotion/media-utils` — waveform musicale
5. `@remotion/animation-utils` — presets d'anim de texte
6. `@remotion/lottie` — icônes/illustrations animées toutes faites
7. `@remotion/motion-blur` + `@remotion/noise` — finitions cinématiques
8. `@remotion/skia` / `@remotion/three` — color grading / 3D (plus tard, lourd)
