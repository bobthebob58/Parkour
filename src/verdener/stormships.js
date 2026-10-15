/* =====================================================================
   VERDENSSÆT 'stormships' – Stormskibene (bane 9)
   En flåde af flyvende sejlskibe i tordenvejr: våde dæk, skrog med
   kanoner og lanterner, svingende ankre, ræer, rigning, gangspil,
   master med udkigstønder, regn og lyn.
   ===================================================================== */
(function () {
  'use strict';

  window.SKYHOJ_THEMES.stormships = {
    top: '#1a2230', horizon: '#56637a', bottom: '#2e2a36', sunElev: 40, sunAz: 120, sunColor: '#c8d6f0', sunInt: 1.9,
    hemiSky: '#8a9ab6', hemiInt: 1.1, fog: '#3e4a5c', fogNear: 45, fogFar: 400, cloud: '#5a6474', clouds: 1, stars: 0,
    stone: '#9aa2ae', exposure: 1.18, lavaGlow: 1.25,
  };

  window.SKYHOJ_KITS.stormships = {
    id: 'stormships',
    name: 'Stormskibene',
    variants: {
      deck: 'Vådt skibsdæk med tjærede fuger, mørkt skrog med kanonporte under (standard for p). Kasse w 3-10, d 4-20',
      bow: 'Skibsstævn: dæk på et skrog, der spidser til under (godt til smalle platforme). Kasse w 2-5',
      top: 'Udkigstønde/mastetop: rund tønde på en mast (standard for cyl). shape:"cyl" w 1.5-4',
      plank: 'Løs planke (standard for crumble): revnet, slidt træ. Kasse w 1.5-3',
      anchor: 'Stort jernanker hængende i kæde (standard for swing). Kasse w 2-4',
      flagship: 'Flagskibets agterdæk med messing og lanterner (standard for start/finish). w 8-14',
    },
    barVariants: 'Stænger er ræer (rundholt med sejl foldet op); trapez er rigning (tov). Svævebaner er tovværk. Krogpunkter er jernringe på mastetoppe.',
    create(ctx) {
      const { THREE } = ctx;
      const L = window.SKYHOJ_KITLIB(ctx);
      const PI = Math.PI, TAU = L.TAU, tr = L.tr;
      const rng = ctx.mulberry32(900 + ctx.levelIndex);
      const anim = { rain: null, flash: null, flashT: 0, lanterns: [], ships: [] };

      const deckTex = L.tex(256, (g, S) => {
        for (let x = 0; x < S; x += 22) { g.fillStyle = ['#6a5038', '#5e4632', '#735a40'][(x / 22) % 3]; g.fillRect(x, 0, 22, S); g.fillStyle = '#1e1610'; g.fillRect(x, 0, 2, S); }
        g.fillStyle = '#2a2018'; for (let y = 0; y < S; y += 96) for (let x = 0; x < S; x += 22) g.fillRect(x, y + (x % 44), 22, 2);
      });
      const hullTex = L.tex(256, (g, S) => {
        for (let y = 0; y < S; y += 18) { g.fillStyle = ['#3a2a20', '#33251c', '#402e22'][(y / 18) % 3]; g.fillRect(0, y, S, 18); g.fillStyle = '#1a120c'; g.fillRect(0, y, S, 2); }
        g.fillStyle = '#c8a040'; g.fillRect(0, 10, S, 5);
        g.fillStyle = '#120c08'; for (let x = 30; x < S; x += 80) g.fillRect(x, 60, 26, 22);
      });
      const crackTex = L.tex(256, (g, S) => {
        for (let x = 0; x < S; x += 32) { g.fillStyle = ['#7a6248', '#6a5440'][(x / 32) % 2]; g.fillRect(x, 0, 32, S); }
        L.cracks(g, S, S, '#1a1008', 16, rng, 3);
      });
      const sailTex = L.tex(128, (g, S) => { L.fill(g, S, S, '#d8ccb0'); g.strokeStyle = '#b8a888'; g.lineWidth = 2; for (let x = 0; x < S; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke(); } });
      const M = {
        wetDeck: L.phys({ map: deckTex, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1 }),
        hull: L.std({ map: hullTex, roughness: 0.7 }),
        plank: L.std({ map: crackTex, roughness: 0.85 }),
        wood: L.std({ color: '#5a4030', roughness: 0.8 }),
        iron: L.std({ color: '#2e3036', roughness: 0.45, metalness: 0.85 }),
        brass: L.std({ color: '#c8a040', roughness: 0.3, metalness: 0.9 }),
        rope: L.std({ color: '#a88a5a', roughness: 0.9 }),
        sail: L.std({ map: sailTex, roughness: 0.85, side: THREE.DoubleSide }),
        lantern: L.std({ color: '#ffd88a', emissive: '#ffb040', emissiveIntensity: 2.2 }),
        bounce: L.std({ color: '#5a6a8a', roughness: 0.4, emissive: '#3a5aaa', emissiveIntensity: 0.3 }),
      };
      const variantOf = (p) => p.v || (p.type === 'start' || p.type === 'finish' ? 'flagship' : p.type === 'crumble' ? 'plank'
        : p.swing ? 'anchor' : p.shape === 'cyl' ? 'top' : Math.min(p.w, p.d) < 3 ? 'bow' : 'deck');

      const ship = (len) => { // kulisseskib: skrog, master og sejl
        const s = new THREE.Group();
        const hull = new THREE.Mesh(tr(new THREE.CylinderGeometry(len * 0.16, len * 0.06, len, 8, 1, false, 0, PI).rotateZ(PI / 2).rotateX(PI)), M.hull);
        hull.scale.set(1, 1, 0.7); s.add(hull);
        for (let k = -1; k <= 1; k++) {
          const mast = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.4, 0.5, len * 0.8, 6)), M.wood);
          mast.position.set(k * len * 0.28, len * 0.4, 0); s.add(mast);
          const sail = new THREE.Mesh(tr(new THREE.PlaneGeometry(len * 0.3, len * 0.35, 4, 4)), M.sail);
          sail.position.set(k * len * 0.28, len * 0.45, 0.6); sail.rotation.y = PI / 2; s.add(sail);
        }
        return s;
      };

      return {
        ventColor: '#cfe0ff',
        slickColor: '#7ab8ff',
        platform(p) {
          const g = new THREE.Group();
          const v = variantOf(p), minD = Math.min(p.w, p.d);
          if (v === 'top') {
            g.add(L.block(p, { top: M.wetDeck, side: M.wood }, 1.5, { segments: 16 }));
            const band = new THREE.Mesh(tr(new THREE.CylinderGeometry(p.w / 2 + 0.03, p.w / 2 + 0.03, 0.12, 16, 1, true)), M.iron);
            band.position.y = -p.h * 0.2; g.add(band);
            const mast = L.pillar(p, M.wood, 22, p.w * 0.36, 2); if (mast) g.add(mast);
          } else if (v === 'anchor') {
            g.add(L.block(p, { top: M.iron, side: M.iron }, 2));
            const fl = new THREE.Mesh(tr(new THREE.TorusGeometry(minD * 0.45, 0.18, 8, 16, PI)), M.iron);
            fl.rotation.z = PI; fl.position.y = -p.h / 2 - 0.2; g.add(fl);
          } else if (v === 'plank') {
            g.add(L.block(p, { top: M.plank, side: M.plank }, 2));
          } else {
            g.add(L.block(p, { top: M.wetDeck, side: M.hull }, 2, { sideTile: Math.max(1, p.h) }));
            const hull = L.under(p, M.hull, v === 'bow' ? 3 : 2 + minD * 0.5, { tip: v === 'bow' ? 0.15 : 0.45, segments: 6 });
            if (hull) g.add(hull);
            if (v === 'flagship') {
              for (const sx of [-1, 1]) {
                const lan = new THREE.Mesh(tr(new THREE.SphereGeometry(0.22, 10, 8)), M.lantern);
                lan.position.set(sx * (p.w / 2 + 0.2), -p.h / 2 - 0.2, p.d * 0.45); g.add(lan); anim.lanterns.push(lan);
              }
            }
          }
          if (p.type === 'bounce') g.children[0].material = [M.hull, M.hull, M.bounce, M.hull, M.hull, M.hull];
          if (p.type === 'conveyor') g.children[0].material = [M.hull, M.hull, L.std({ map: L.beltTex('#3a2a20', '#4a3a2a', '#c8a040'), roughness: 0.8 }), M.hull, M.hull, M.hull];
          if (p.type === 'vent') g.children[0].material = [M.hull, M.hull, L.std({ map: L.grateTex('#1a120c', '#5a4030'), roughness: 0.8 }), M.hull, M.hull, M.hull];
          return g;
        },
        spinArm(p) { // gangspillets håndspager
          const arm = new THREE.Mesh(tr(new THREE.CylinderGeometry(0.16, 0.16, p.bar, 8).rotateZ(PI / 2)), M.wood);
          return arm;
        },
        bar(b) { // rå med et sammenrullet sejl
          const g = new THREE.Group();
          g.add(L.barMesh(b, M.wood, b.r * 1.15));
          const furl = new THREE.Mesh(tr(new THREE.CylinderGeometry(b.r * 2.2, b.r * 2.2, b.len * 0.8, 10).rotateZ(PI / 2)), M.sail);
          furl.position.y = b.r * 3.4; g.add(furl);
          return g;
        },
        anchor() {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(tr(new THREE.CylinderGeometry(0.14, 0.18, 0.5, 8)), M.brass));
          const top = new THREE.Mesh(tr(new THREE.SphereGeometry(0.18, 10, 8)), M.lantern); top.position.y = 0.3; g.add(top);
          return g;
        },
        zip(z) {
          const a = new THREE.Vector3(z.ax, z.ay, z.az), b = new THREE.Vector3(z.bx, z.by, z.bz);
          return L.tube([a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -0.25, 0)), b], 0.045, M.rope, 20);
        },
        decor(data) {
          const root = new THREE.Group();
          const b = data.bounds, R0 = b.radius + 40;
          L.place(data, rng, 14, R0, R0 + 260, b.minY - 20, b.maxY + 10, 25, (x, y, z) => {
            const s = ship(30 + rng() * 40); s.position.set(x, y, z); s.rotation.y = rng() * TAU;
            root.add(s); anim.ships.push({ m: s, ph: rng() * TAU });
          });
          // Regn: lodrette streger som punkter, der falder
          const pos = [];
          for (let i = 0; i < 2500; i++) pos.push(b.cx + (rng() - 0.5) * b.radius * 2.6, b.minY - 20 + rng() * 80, b.cz + (rng() - 0.5) * b.radius * 2.6);
          anim.rain = L.points(pos, '#bcd0ee', 1.6, 0.55);
          anim.rain.material.fog = true;
          root.add(anim.rain);
          // Lyn: et stort lysglimt i skyerne (blinker af og til)
          anim.flash = new THREE.Mesh(tr(new THREE.PlaneGeometry(800, 400)), tr(new THREE.MeshBasicMaterial({ color: '#dfe8ff', transparent: true, opacity: 0, fog: false, depthWrite: false, blending: THREE.AdditiveBlending })));
          anim.flash.position.set(b.cx + 600, b.maxY + 200, b.cz - 600); anim.flash.lookAt(b.cx, b.maxY, b.cz);
          root.add(anim.flash);
          return root;
        },
        update(dt, t) {
          if (anim.rain) anim.rain.position.y = -((t * 30) % 40);
          if (anim.flash) {
            anim.flashT -= dt;
            if (anim.flashT < -4 - (Math.sin(t * 1.7) + 1) * 3) anim.flashT = 0.25;
            anim.flash.material.opacity = anim.flashT > 0 ? 0.6 * Math.abs(Math.sin(anim.flashT * 40)) : 0;
          }
          for (const s of anim.ships) { s.m.position.y += Math.sin(t * 0.6 + s.ph) * dt * 0.8; s.m.rotation.z = Math.sin(t * 0.5 + s.ph) * 0.04; }
          for (const l of anim.lanterns) l.material.emissiveIntensity = 2 + Math.sin(t * 6) * 0.3;
        },
      };
    },
  };
})();
