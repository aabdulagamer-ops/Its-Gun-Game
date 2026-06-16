import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

/* ================= SCENE ================= */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

/* ================= CAMERA (FIXED) ================= */
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0,2,5);

/* ================= RENDERER ================= */
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

/* ================= LIGHT (BETTER QUALITY) ================= */
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(10,20,10);
sun.castShadow = true;
scene.add(sun);

const ambient = new THREE.AmbientLight(0x666666);
scene.add(ambient);

/* ================= TEXTURE GROUND ================= */
const textureLoader = new THREE.TextureLoader();

const grassTexture = textureLoader.load(
  "https://threejs.org/examples/textures/terrain/grasslight-big.jpg"
);

grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
grassTexture.repeat.set(10,10);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200,200),
  new THREE.MeshStandardMaterial({ map: grassTexture })
);

ground.rotation.x = -Math.PI/2;
scene.add(ground);

/* ================= SKY ================= */
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(200,32,32),
  new THREE.MeshBasicMaterial({color:0x87ceeb, side:THREE.BackSide})
);
scene.add(sky);

/* ================= REAL LOOK GUN ================= */
const gun = new THREE.Group();

const metal = new THREE.MeshStandardMaterial({ color:0x222222 });

const body = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.2,1), metal);
const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.1,0.1,1.5), metal);

barrel.position.z = -1;

gun.add(body);
gun.add(barrel);

/* camera gun FIX */
camera.add(gun);
gun.position.set(0.5,-0.5,-1);

/* ================= ENEMIES ================= */
let enemies = [];

function spawnEnemy(){
  const e = new THREE.Mesh(
    new THREE.BoxGeometry(1,2,1),
    new THREE.MeshStandardMaterial({color:"red"})
  );

  e.position.set((Math.random()-0.5)*40,1,(Math.random()-0.5)*40);
  scene.add(e);
  enemies.push(e);
}

for(let i=0;i<20;i++) spawnEnemy();

/* ================= CAMERA FIX (IMPORTANT) ================= */
let yaw=0,pitch=0;

/* ================= CONTROLS ================= */
let keys={};

document.addEventListener("keydown",e=>keys[e.key.toLowerCase()]=true);
document.addEventListener("keyup",e=>keys[e.key.toLowerCase()]=false);

/* ================= MOUSE ================= */
document.body.addEventListener("click",()=>document.body.requestPointerLock());

document.addEventListener("mousemove",(e)=>{
  if(document.pointerLockElement===document.body){
    yaw -= e.movementX*0.0025;
    pitch -= e.movementY*0.0025;
    pitch=Math.max(-1.5,Math.min(1.5,pitch));
  }
});

/* ================= SHOOT ================= */
const raycaster = new THREE.Raycaster();

let ammo=30;
let score=0;
let hp=100;

window.addEventListener("click",()=>{

  if(ammo<=0) return;
  ammo--;

  raycaster.setFromCamera(new THREE.Vector2(0,0),camera);

  const hit = raycaster.intersectObjects(enemies);

  if(hit.length>0){
    scene.remove(hit[0].object);
    enemies = enemies.filter(e=>e!==hit[0].object);
    score++;
  }

  updateUI();
});

/* ================= UI ================= */
function updateUI(){
  document.getElementById("hud").innerText =
  `HP:${hp} | Ammo:${ammo} | Score:${score}`;
}

/* ================= MOVE ================= */
function move(){
  const speed=0.15;

  const forward=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
  const right=new THREE.Vector3(Math.sin(yaw+Math.PI/2),0,Math.cos(yaw+Math.PI/2));

  if(keys["w"])camera.position.add(forward.clone().multiplyScalar(-speed));
  if(keys["s"])camera.position.add(forward.clone().multiplyScalar(speed));
  if(keys["a"])camera.position.add(right.clone().multiplyScalar(-speed));
  if(keys["d"])camera.position.add(right.clone().multiplyScalar(speed));
}

/* ================= LOOP ================= */
function animate(){
  requestAnimationFrame(animate);

  camera.rotation.set(pitch,yaw,0);

  move();

  renderer.render(scene,camera);
}

updateUI();
animate();