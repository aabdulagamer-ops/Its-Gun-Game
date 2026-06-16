// --- Globals & Game State ---
let camera, scene, renderer, controls;
let raycaster = new THREE.Raycaster();
const centerVector = new THREE.Vector2(0, 0);

// Physics/Movement
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let prevTime = performance.now();

// Stats
let health = 100;
let ammo = 30;
const maxAmmo = 30;
let score = 0;
let isReloading = false;

// Entities
let zombies = [];
let hitboxes = [];
let particles = []; // Blood system

// Weapon
let weaponGroup;
let muzzleFlash;
let recoilAmount = 0;

// Audio context
let audioCtx;

// UI
const hpEl = document.getElementById('hp');
const ammoEl = document.getElementById('ammo');
const scoreEl = document.getElementById('score');
const menuEl = document.getElementById('menu');
const flashEl = document.getElementById('damageFlash');
const hitMarkerEl = document.getElementById('hitMarker');
const startBtn = document.getElementById('startButton');

init();
animate();

function init() {
    // 1. Scene & Atmosphere
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a2639); // Dark blueish sky
    scene.fog = new THREE.FogExp2(0x1a2639, 0.02); // Moody fog

    // 2. Camera & Smooth Controls
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    controls = new THREE.PointerLockControls(camera, document.body);
    controls.getObject().position.y = 2.2; 
    scene.add(controls.getObject());

    startBtn.addEventListener('click', () => {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        controls.lock();
    });
    
    controls.addEventListener('lock', () => menuEl.style.display = 'none');
    controls.addEventListener('unlock', () => {
        if (health > 0) startBtn.innerText = "RESUME MISSION";
        menuEl.style.display = 'flex';
    });

    // 3. High Quality Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 1.2); 
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff0dd, 0.8);
    sunLight.position.set(100, 150, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 300;
    sunLight.shadow.camera.left = -100;
    sunLight.shadow.camera.right = 100;
    sunLight.shadow.camera.top = 100;
    sunLight.shadow.camera.bottom = -100;
    scene.add(sunLight);

    // 4. Procedural Map & Weapon
    buildMap();
    createWeapon();

    // 5. Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // 6. Listeners & Game Timers
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('resize', onWindowResize);

    setInterval(spawnZombie, 3000); // Spawns new zombie every 3 seconds
}

// --- Procedural Textures ---
function createTexture(type) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');

    if (type === 'grass') {
        ctx.fillStyle = '#1d2e15';
        ctx.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 5000; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#243a1a' : '#14220e';
            ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
        }
    } else if (type === 'wall') {
        ctx.fillStyle = '#666'; // Concrete base
        ctx.fillRect(0, 0, 256, 256);
        for(let i=0; i<1000; i++) {
            ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.1})`;
            ctx.fillRect(Math.random()*256, Math.random()*256, Math.random()*20, Math.random()*20);
        }
    } else if (type === 'roof') {
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#1a1a1a';
        for(let y=0; y<256; y+=16) ctx.fillRect(0, y, 256, 4);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

// --- Map Builder (Varied Houses) ---
function buildMap() {
    const grassTex = createTexture('grass');
    grassTex.repeat.set(40, 40);
    const wallTex = createTexture('wall');
    wallTex.repeat.set(2, 2);
    const roofTex = createTexture('roof');
    roofTex.repeat.set(2, 2);

    const matGrass = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1.0 });
    const matWall = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
    const matRoof = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.7 });

    // Ground
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), matGrass);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Varied Buildings
    for (let i = 0; i < 35; i++) {
        const x = (Math.random() - 0.5) * 250;
        const z = (Math.random() - 0.5) * 250;
        if (Math.abs(x) < 25 && Math.abs(z) < 25) continue; // Keep center spawn clear

        // Randomly generate building shape
        const w = 8 + Math.random() * 15;
        const d = 8 + Math.random() * 15;
        const isTall = Math.random() > 0.7;
        const h = isTall ? 15 + Math.random() * 10 : 6 + Math.random() * 4;

        const house = new THREE.Group();
        house.position.set(x, 0, z);

        // Main Block
        const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matWall);
        walls.position.y = h / 2;
        walls.castShadow = true;
        walls.receiveShadow = true;
        house.add(walls);

        // Collision for shooting/movement bounds (Optional: for shooting)
        hitboxes.push(walls); 

        // Roof
        if (!isTall) { // Pitched roof for small houses
            const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w,d)*0.7, 5, 4), matRoof);
            roof.position.y = h + 2.5;
            roof.rotation.y = Math.PI / 4;
            roof.castShadow = true;
            house.add(roof);
        } else { // Flat roof rim for tall buildings
            const trim = new THREE.Mesh(new THREE.BoxGeometry(w+0.5, 1, d+0.5), matRoof);
            trim.position.y = h + 0.5;
            trim.castShadow = true;
            house.add(trim);
        }
        scene.add(house);
    }
}

// --- Weapon Model ---
function createWeapon() {
    weaponGroup = new THREE.Group();
    
    const matMetal = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.2 });
    const matPlastic = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.5), matPlastic);
    weaponGroup.add(body);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8), matMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.4);
    weaponGroup.add(barrel);

    // Muzzle Flash
    const flashGeom = new THREE.PlaneGeometry(0.5, 0.5);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0, side: THREE.DoubleSide });
    muzzleFlash = new THREE.Mesh(flashGeom, flashMat);
    muzzleFlash.position.set(0, 0.03, -0.65);
    weaponGroup.add(muzzleFlash);

    // Position in front of camera
    weaponGroup.position.set(0.3, -0.3, -0.5);
    camera.add(weaponGroup);
}

// --- Audio Effects (Procedural) ---
function playSound(type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;
    
    if (type === 'shoot') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.1);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(); osc.stop(now + 0.1);
    } else if (type === 'hit') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(); osc.stop(now + 0.05);
    } else if (type === 'death') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.linearRampToValueAtTime(30, now + 0.4);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
        osc.start(); osc.stop(now + 0.4);
    }
}

// --- Zombie System ---
function spawnZombie() {
    // Max 25 zombies alive or dead to save performance
    if (zombies.length >= 25 || !controls.isLocked) return;

    const zGroup = new THREE.Group();
    zGroup.state = 'ALIVE'; // States: ALIVE, DYING, DEAD
    zGroup.hp = 100;
    zGroup.animTime = Math.random() * 10;

    const matSkin = new THREE.MeshStandardMaterial({ color: 0x4a5d23, roughness: 0.8 }); // Rotting green
    const matClothes = new THREE.MeshStandardMaterial({ color: 0x3d2b1f }); // Dirty brown

    // Body Parts
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), matSkin);
    head.position.y = 3.1;
    zGroup.add(head);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.4, 0.5), matClothes);
    torso.position.y = 2.0;
    zGroup.add(torso);

    const armGeo = new THREE.BoxGeometry(0.3, 1.2, 0.3);
    const lArm = new THREE.Mesh(armGeo, matSkin);
    lArm.position.set(-0.7, 2.0, 0.4);
    lArm.rotation.x = Math.PI / 2.2; // Arms stretched out forward
    zGroup.add(lArm);

    const rArm = new THREE.Mesh(armGeo, matSkin);
    rArm.position.set(0.7, 2.0, 0.4);
    rArm.rotation.x = Math.PI / 2.2;
    zGroup.add(rArm);

    const legGeo = new THREE.BoxGeometry(0.4, 1.4, 0.4);
    const lLeg = new THREE.Mesh(legGeo, matClothes);
    lLeg.position.set(-0.3, 0.7, 0);
    zGroup.add(lLeg);
    zGroup.lLeg = lLeg; // Save ref for walking animation

    const rLeg = new THREE.Mesh(legGeo, matClothes);
    rLeg.position.set(0.3, 0.7, 0);
    zGroup.add(rLeg);
    zGroup.rLeg = rLeg;

    // Invisible Hitbox for easy shooting
    const hitbox = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 3.8, 1.2),
        new THREE.MeshBasicMaterial({ visible: false })
    );
    hitbox.position.y = 1.9;
    hitbox.zombieParent = zGroup; // Link to parent
    zGroup.add(hitbox);
    hitboxes.push(hitbox);

    // Shadows
    zGroup.traverse(child => { if(child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });

    // Spawn completely out of view
    const angle = Math.random() * Math.PI * 2;
    const radius = 60 + Math.random() * 40;
    const px = controls.getObject().position.x + Math.cos(angle) * radius;
    const pz = controls.getObject().position.z + Math.sin(angle) * radius;
    zGroup.position.set(px, 0, pz);

    scene.add(zGroup);
    zombies.push(zGroup);
}

// --- Blood Particle System ---
function spawnBlood(pos) {
    const bloodMat = new THREE.MeshBasicMaterial({ color: 0xaa0000 });
    const bloodGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);

    for(let i=0; i<12; i++) {
        const p = new THREE.Mesh(bloodGeo, bloodMat);
        p.position.copy(pos);
        p.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 8,
            Math.random() * 8 + 2,
            (Math.random() - 0.5) * 8
        );
        p.life = 1.0;
        scene.add(p);
        particles.push(p);
    }
}

// --- Inputs & Mechanics ---
function onKeyDown(e) {
    switch(e.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyD': moveRight = true; break;
        case 'KeyR': reloadWeapon(); break;
    }
}

function onKeyUp(e) {
    switch(e.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyD': moveRight = false; break;
    }
}

function onMouseDown(e) {
    if (!controls.isLocked || isReloading) return;
    if (e.button === 0) shoot();
}

function shoot() {
    if (ammo <= 0) { reloadWeapon(); return; }

    ammo--;
    recoilAmount = 1.0;
    updateHUD();
    playSound('shoot');

    // Muzzle Flash
    muzzleFlash.material.opacity = 1;
    muzzleFlash.rotation.z = Math.random() * Math.PI;
    setTimeout(() => muzzleFlash.material.opacity = 0, 50);

    // Raycast hit detection
    raycaster.setFromCamera(centerVector, camera);
    const intersects = raycaster.intersectObjects(hitboxes);

    if (intersects.length > 0) {
        const hit = intersects[0];
        
        // If hit a zombie
        if (hit.object.zombieParent && hit.object.zombieParent.state === 'ALIVE') {
            const z = hit.object.zombieParent;
            spawnBlood(hit.point);
            playSound('hit');
            showHitMarker();
            
            z.hp -= 35; // Takes ~3 shots to kill
            if (z.hp <= 0) {
                z.state = 'DYING';
                playSound('death');
                score += 50;
                updateHUD();
            }
        }
    }
}

function showHitMarker() {
    hitMarkerEl.style.opacity = 1;
    setTimeout(() => hitMarkerEl.style.opacity = 0, 100);
}

function reloadWeapon() {
    if (ammo === maxAmmo || isReloading) return;
    isReloading = true;
    
    // Smooth reload down/up
    const start = performance.now();
    const anim = () => {
        if(!isReloading) return;
        const p = (performance.now() - start) / 1000;
        if (p < 0.5) {
            weaponGroup.rotation.x = -p * Math.PI;
            weaponGroup.position.y = -0.3 - p;
        } else if (p < 1) {
            const p2 = (p - 0.5) * 2;
            weaponGroup.rotation.x = -(1 - p2) * (Math.PI / 2);
            weaponGroup.position.y = -0.8 + (p2 * 0.5);
        } else {
            ammo = maxAmmo;
            isReloading = false;
            weaponGroup.rotation.x = 0;
            weaponGroup.position.y = -0.3;
            updateHUD();
        }
        if(isReloading) requestAnimationFrame(anim);
    };
    anim();
}

function takeDamage(amount) {
    health -= amount;
    flashEl.style.opacity = 1;
    setTimeout(() => flashEl.style.opacity = 0, 150);
    updateHUD();
    if (health <= 0) die();
}

function die() {
    controls.unlock();
    startBtn.innerText = "YOU DIED. CLICK TO RESTART";
    
    health = 100;
    score = 0;
    ammo = maxAmmo;
    isReloading = false;
    weaponGroup.rotation.x = 0;
    weaponGroup.position.y = -0.3;
    
    // Clean up all zombies
    zombies.forEach(z => scene.remove(z));
    zombies = [];
    hitboxes = hitboxes.filter(h => !h.zombieParent); // remove zombie hitboxes
    
    controls.getObject().position.set(0, 2.2, 0);
    updateHUD();
}

function updateHUD() {
    hpEl.innerText = Math.floor(Math.max(0, health));
    hpEl.style.color = health <= 30 ? '#ff3333' : '#fff';
    ammoEl.innerText = ammo;
    scoreEl.innerText = score;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Main Loop ---
function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    let delta = (time - prevTime) / 1000;
    if (delta > 0.1) delta = 0.1;
    prevTime = time;

    if (controls.isLocked) {
        // 1. Weapon Recoil & Bobbing
        if (recoilAmount > 0) {
            weaponGroup.position.z = -0.5 + (recoilAmount * 0.15);
            weaponGroup.rotation.x = recoilAmount * 0.2;
            recoilAmount -= delta * 5.0;
        } else {
            weaponGroup.position.z = -0.5;
            if(!isReloading) weaponGroup.rotation.x = 0;
        }

        // 2. Smooth FPS Movement
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        const speed = 75.0;
        if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);

        // Keep player on ground & basic bounds
        const pos = controls.getObject().position;
        pos.y = 2.2; 
        if (pos.x > 140) pos.x = 140; if (pos.x < -140) pos.x = -140;
        if (pos.z > 140) pos.z = 140; if (pos.z < -140) pos.z = -140;

        // 3. Zombie AI & Death Animations
        const playerPos = controls.getObject().position.clone();
        playerPos.y = 0; // Look at ground level

        for (let i = zombies.length - 1; i >= 0; i--) {
            let z = zombies[i];
            
            if (z.state === 'ALIVE') {
                z.animTime += delta * 4;
                
                // Move towards player
                const zPos = z.position.clone();
                const dir = new THREE.Vector3().subVectors(playerPos, zPos).normalize();
                z.position.add(dir.multiplyScalar(3.5 * delta)); // Walk speed
                z.lookAt(playerPos);

                // Leg animation
                z.lLeg.rotation.x = Math.sin(z.animTime) * 0.6;
                z.rLeg.rotation.x = Math.cos(z.animTime) * 0.6;

                // Damage player if close
                if (z.position.distanceTo(pos) < 2.5) {
                    takeDamage(15 * delta); // 15 damage per second
                }
            } 
            else if (z.state === 'DYING') {
                // Fall backwards smoothly
                z.rotation.x -= delta * 3;
                if (z.rotation.x <= -Math.PI / 2) {
                    z.rotation.x = -Math.PI / 2;
                    z.state = 'DEAD';
                    z.deadTimer = time;
                    // Remove hitbox so it blocks no more bullets
                    hitboxes = hitboxes.filter(h => h.zombieParent !== z);
                }
            }
            else if (z.state === 'DEAD') {
                // Decay System: Remove body after 30 seconds (30000 ms)
                if (time - z.deadTimer > 30000) {
                    scene.remove(z);
                    zombies.splice(i, 1);
                }
            }
        }

        // 4. Blood Particles Update
        for(let i = particles.length - 1; i >= 0; i--) {
            let p = particles[i];
            p.position.add(p.velocity.clone().multiplyScalar(delta));
            p.velocity.y -= 25 * delta; // Gravity pull
            p.life -= delta * 1.5;
            
            // Floor collision
            if(p.position.y < 0.1) {
                p.position.y = 0.1;
                p.velocity.set(0,0,0);
            }

            if(p.life <= 0) {
                scene.remove(p);
                particles.splice(i, 1);
            } else {
                p.scale.setScalar(Math.max(0, p.life));
            }
        }
    }

    renderer.render(scene, camera);
}