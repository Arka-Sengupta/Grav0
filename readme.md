# 🌌 Grav0

**Grav0** is a highly optimized, fully client-side GPU-Accelerated Relativistic Gravity Simulator. It dynamically visualizes real-world N-body celestial mechanics and the resulting curvature of the spacetime fabric in real-time inside your browser. 

The project uses a pure CPU Leapfrog integrator for high-fidelity physics calculations and offloads heavy visual grid mathematical displacements directly to your GPU via WebGL using raw GLSL fragment and vertex shaders.

##  Features

- **N-Body Leapfrog Physics Engine**: A powerful integration algorithm simulating interacting stars, planets, and black holes natively on the main thread CPU.
- **Relativistic Spacetime Mesh**: An elastic "infinite" WebGL grid that bends smoothly based on the aggregated Newtonian potential of surrounding bodies, dynamically dampening objects infinitely approaching its mathematical limits to avert immersion-breaking artifacting.
- **Dynamic Camera Elastic Scaling**: A custom infinite-scrolling shader logic keeping the grid locked and scaling seamlessly to whatever altitude you observe from.
- **Sub-linear Visual Dampening**: Supermassive Black Holes look visually striking, casting immense but beautifully localized gravity funnels without instantly swallowing the entire universe's visual real estate.
- **No Backend**: Runs incredibly fast directly entirely off your computer's native javascript engine V8 natively in Chrome. Zero remote servers or APIs involved.
- **Sleek UI**: Modern, glassmorphism-based HUD allowing complete parametric control of initial positions, trajectories, and velocities perfectly matched with intuitive tracking tools.

##  Architecture

Grav0 operates completely within the browser. 

1. **The Math & Physics Engine (CPU)**
   The `simulation.js` file handles all mathematical trajectories. It strictly calculates new vector positions depending on relative multi-bodied pulls running concurrently.
2. **The Graphics Offload (GPU)**
   `spacetime.js` utilizes `three.js` built using `ShaderMaterial`s heavily written in raw `GLSL`. It binds world-space variables, mapping absolute grid coordinates into deep, fluid-looking visual deformations representing gravitational 'wells'.
3. **User Interaction & Development Server**
   Tied closely with `ui.js`, manipulating parameters is an entirely localized experience. Under the hood, running the project works off Vite's rapid local development server fetching strictly local bundle elements.

##  Filetree

```
├── public
│   ├── favicon.svg
│   └── icons.svg
├── src
│   ├── assets
│   │   ├── hero.png
│   │   ├── javascript.svg
│   │   └── vite.svg
│   ├── shaders
│   │   ├── position.glsl
│   │   └── velocity.glsl
│   ├── bodies.js
│   ├── main.js
│   ├── scene.js
│   ├── simulation.js
│   ├── spacetime.js
│   ├── ui.js
│   └── utils.js
├── .gitignore
├── index.html
├── package-lock.json
├── package.json
├── readme.md
├── style.css
└── vite.config.js
```

##  Running the Simulator
You can use it using the link
https://grav0.netlify.app/
or if you wanna install locally:
1. Ensure you have **Node.js** installed locally.
2. In the folder terminal run:
   ```bash
   npm install
   npm run dev
   ```
3. A local preview URL will open on `localhost`. 
